/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS fixture with a test-only Prisma module binding. */
/* Run with node --import tsx. Uses an isolated loopback Redis DB, disposable Prisma/PGlite,
 * a real BullMQ worker running the production dispatcher, and a local HTTP provider. */
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const { randomUUID } = require('node:crypto')
const { Queue, Worker } = require('bullmq')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { openPglitePrisma } = require('../helpers/pglite-prisma.ts')
const { loadIsolatedModule } = require('../helpers/promo-dispatch-harness.ts')
const contract = require('../../shared/bein/balance-refresh.ts')
const store = require('../../shared/bein/balance-refresh-store.ts')

async function main() {
    assert.equal(process.env.BALANCE_REFRESH_TEST_REDIS_URL, 'redis://127.0.0.1:16379/15')
    process.env.REDIS_URL = process.env.BALANCE_REFRESH_TEST_REDIS_URL
    process.env.BEIN_ALLOW_PLAINTEXT_CREDENTIALS = 'true'
    const database = await openPglitePrisma()
    const { db } = database
    const prismaPath = require.resolve('../../worker/src/lib/prisma.ts')
    require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: db } }
    const { getRedisConnection, closeRedisConnection } = require('../../worker/src/lib/redis.ts')
    const connection = getRedisConnection()
    const prefix = 'qa-' + randomUUID()
    const queue = new Queue('operations', { connection, prefix })
    const ids = ['first', 'second'].map(name => prefix + '-' + name)
    const jobs = [], posts = [], reads = []
    let release
    const delayed = new Promise(resolve => { release = resolve })
    let hideStatus = false, invalidBalance = false, limited = false
    let bundle, css, origin, worker, browser
    const server = http.createServer((req, res) => {
        const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type':'application/json' }); res.end(JSON.stringify(value)) }
        async function serve() {
            const url = new URL(req.url, origin)
            if (url.pathname === '/provider/renew') {
                if (req.method === 'GET') return res.end('<html><input id="__VIEWSTATE" value="' + 'v'.repeat(120) + '"></html>')
                const first = (req.headers.cookie || '').includes('fixture=first')
                reads.push(first ? ids[0] : ids[1])
                if (first) await delayed
                if (limited) { res.writeHead(429); return res.end('Provider limit') }
                return res.end(invalidBalance ? 'Provider response without balance' : 'Your Current Credit Balance is ' + (first ? '1234' : '2345') + ' USD')
            }
            if (url.pathname.endsWith('/check-balance')) {
                const id = url.pathname.split('/')[4]
                assert.ok(ids.includes(id))
                if (hideStatus && req.method === 'GET') return json({ code: 'STATUS_UNAVAILABLE' }, 503)
                const chunks = []
                for await (const chunk of req) chunks.push(chunk)
                if (req.method === 'POST') posts.push(id)
                const request = Object.assign(new Request(url, { method: req.method,
                    ...(req.method === 'POST' ? { body: Buffer.concat(chunks).toString() } : {}) }), { nextUrl:url })
                const response = await api[req.method](request, { params: Promise.resolve({ id }) })
                const body = await response.json()
                console.log(req.method, 'balance', response.status, body.code || body.data?.state)
                return json(body, response.status)
            }
            if (url.pathname === '/api/admin/bein-accounts') {
                const accounts = await db.beinAccount.findMany({orderBy:{ username:'asc' }})
                return json({success:true, poolStatus:null, accounts:accounts.map(a=>({ ...a, password:undefined, successRate:100, operationsCount:0 }))})
            }
            if (url.pathname.startsWith('/api/')) return json({ success:true, proxies:[], notifications:[], unreadCount:0 })
            if (url.pathname === '/app.js') { res.setHeader('Content-Type','text/javascript'); return res.end(bundle) }
            if (url.pathname === '/images/brand/logo_big1.png') { res.setHeader('Content-Type','image/png'); return res.end(fs.readFileSync('public/images/brand/logo_big1.png')) }
            if (url.pathname === '/app.css') { res.setHeader('Content-Type','text/css'); return res.end(css) }
            res.setHeader('Content-Type','text/html'); res.end('<html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>')
        }
        serve().catch(error=>{ console.error(error); json({error:'fixture error'},500) })
    })
    const api = loadIsolatedModule('src/app/api/admin/bein-accounts/[id]/check-balance/route.ts',{
        'node:crypto':require('node:crypto'),'next/server':{ NextResponse:Response },
        '@/lib/prisma':{ prisma:db }, '@/lib/auth-utils':{requireRoleAPIWithMobile:async()=>({ user:{id:'fixture-admin'} })},
        '@/lib/redis':{default:connection}, '@/lib/queue':{operationsQueue:queue},
        '../../../../../../../shared/bein/balance-refresh':contract, '../../../../../../../shared/bein/balance-refresh-store':store,
    })
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
        origin = 'http://127.0.0.1:' + server.address().port
        for (const [key,value] of Object.entries({bein_login_url:origin+'/provider/login',bein_renew_url:'/provider/renew',bein_connection_mode:'server_ip'}))
            await db.setting.create({data:{key,value}})
        for (const [index,id] of ids.entries()) {
            const username = index ? 'second' : 'first'
            await db.beinAccount.create({data:{id, username, password:'fixture', automationExclusive:true, dealerBalance:7}})
            const { CookieJar } = require('tough-cookie')
            const jar = new CookieJar(); await jar.setCookie('fixture='+username, origin)
            await connection.set('bein:session:v2:'+id+':direct',JSON.stringify({accountId:id, cookies:JSON.stringify(await jar.serialize()),
                loginTimestamp:Date.now(),expiresAt:Date.now()+300000}),'EX',300)
        }
        const {processOperationHttp} = require('../../worker/src/http-queue-processor.ts')
        worker = new Worker('operations', async job => {
            jobs.push(job.data.accountId)
            await processOperationHttp(job, {getRedis:()=>connection, getWorkerId:()=>prefix})
        }, {connection,prefix,concurrency:2})
        worker.on('failed', (job,error)=>console.log('Worker failure:', job?.id, error.message))
        await worker.waitUntilReady()
        const build = await require('esbuild').build({entryPoints:['tests/browser/fixtures/balance-background-entry.tsx'],bundle:true,write:false,
            format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-auth-routing',setup(b){
                b.onResolve({filter:/^(next-auth\/react|next\/navigation|next\/link)$/},arg=>({path:arg.path,namespace:'fixture'}))
                b.onLoad({filter:/.*/,namespace:'fixture'},arg=>({loader:'js',resolveDir:process.cwd(),contents:
                    arg.path==='next-auth/react' ? "const session={status:'authenticated',data:{user:{id:'fixture-admin',role:'ADMIN'}}};export const useSession=()=>session;export const signOut=()=>{};" :
                    arg.path==='next/link' ? "import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}" :
                    "const router={push:path=>location.assign(path)};export const useRouter=()=>router;export const usePathname=()=>location.pathname;"}))
            }}]})
        bundle=build.outputFiles[0].text
        css=(await require('postcss')([require('@tailwindcss/postcss')({base:process.cwd()})])
            .process(fs.readFileSync('src/app/globals.css','utf8'),{from:'src/app/globals.css'})).css
        browser=await chromium.launch({channel:'chrome',headless:true})
        const page=await browser.newPage({viewport:{width:390,height:844}})
        page.setDefaultTimeout(12000)
        page.on('pageerror',error=>console.error('browser:',error))
        const menu=page.locator('[data-panel-command-toggle]'), box=page.locator('[data-panel-command-status]')
        const row=name=>page.locator('tbody tr').filter({has:page.getByText(name,{exact:true})})
        const refresh=name=>row(name).getByTitle('Refresh Balance',{exact:false})
        await page.goto(origin+'/accounts')
        await refresh('first').click()
        await assertEventually(()=>reads.includes(ids[0]),'first worker reaches delayed provider')
        assert.equal(await box.count(),0)
        await menu.click(); await box.waitFor()
        const bounds=await box.boundingBox()
        assert.ok(bounds && bounds.x>=0 && bounds.x+bounds.width<=390)
        fs.mkdirSync('output/panel-ui/037-background',{recursive:true})
        await page.screenshot({path:'output/panel-ui/037-background/tracker-open.png'})
        await page.keyboard.press('Escape')
        assert.equal(await menu.evaluate(el=>el===document.activeElement),true)
        await page.getByRole('link',{name:'Other page',exact:true}).click()
        await page.getByRole('heading',{name:'Other page'}).waitFor()
        await page.getByRole('link',{name:'Accounts',exact:true}).click()
        await refresh('second').click()
        await row('second').getByText('2345 USD',{exact:true}).waitFor()
        assert.equal(await refresh('first').isDisabled(),true)
        await page.screenshot({path:'output/panel-ui/037-background/independent-refresh.png'})
        hideStatus=true
        await row('first').getByText('Check refresh status again').waitFor()
        await menu.click(); await box.getByRole('button',{name:'Close',exact:true}).click()
        assert.equal(await box.count(),0)
        hideStatus=false; release()
        await row('first').getByText('1234 USD',{exact:true}).waitFor()
        assert.equal(await box.count(),0)
        assert.equal((await db.beinAccount.findUniqueOrThrow({where:{id:ids[0]}})).dealerBalance,1234)
        assert.equal((await db.beinAccount.findUniqueOrThrow({where:{id:ids[1]}})).dealerBalance,2345)
        assert.deepEqual(posts,ids);assert.deepEqual(jobs,ids);assert.deepEqual(reads,ids)
        invalidBalance=true
        await refresh('second').click()
        await row('second').getByText('Could not read the balance',{exact:true}).waitFor()
        assert.equal(await refresh('second').isEnabled(),true)
        await menu.click(); await box.waitFor(); await page.keyboard.press('Escape')
        limited=true
        await refresh('second').click()
        await row('second').getByText('Provider rate limit reached',{exact:true}).waitFor()
        assert.equal(await refresh('second').isEnabled(),true)
        await page.reload(); await refresh('second').waitFor()
        assert.equal(await box.count(),0)
        fs.writeFileSync('output/panel-ui/037-background/result.json',JSON.stringify({
            result:'PASS', time:new Date().toISOString(), viewport:[390,844],
            transport:'native Chrome fetch, loopback HTTP, BullMQ, production processOperationHttp and HttpClientService, Prisma/PGlite',
            first:{jobs:jobs.filter(id=>id===ids[0]).length,providerReads:reads.filter(id=>id===ids[0]).length,balance:1234},
            second:{successfulBalance:2345,failures:['BALANCE_NOT_FOUND','PROVIDER_RATE_LIMITED']},
            checks:['header closed initially','Escape restores focus','page navigation during provider wait','independent account','close on unknown','close on failure','row updates from attributed result','database readback','reload stays closed'],
            limits:'Fixture ADMIN identity, document navigation and synthetic local provider. Production was not contacted.'
        },null,2)+'\n')
        console.log('PASS mobile browser, navigation, background SQL write/read, one delivery per click, second account, close/focus, unknown and failed results')
    } finally {
        release()
        await browser?.close()
        await worker?.close()
        if (connection.status === 'ready') await queue.obliterate({force:true})
        await queue.close()
        await closeRedisConnection()
        server.closeAllConnections(); await new Promise(resolve=>server.close(resolve))
        await database.close()
    }
}
async function assertEventually(predicate, description) {
    const end=Date.now()+10000
    while (!predicate() && Date.now()<end) await new Promise(resolve=>setTimeout(resolve,50))
    assert.ok(predicate(),description)
}
main().catch(error=>{console.error(error);process.exitCode=1})
