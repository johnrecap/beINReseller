/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser regression; all HTTP is mocked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
require('tsx/cjs');
const translations = require('../../src/i18n/translations');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
    const repo = process.cwd();
    const output = path.join(repo, 'output/playwright/card-cooldown');
    fs.mkdirSync(output, { recursive: true });
    const mocks = {
        'next/navigation': `const params=new URLSearchParams(location.search); export const useSearchParams=()=>params; export const usePathname=()=>'/dashboard/renew';`,
        'next-auth/react': `const session={data:{user:{id:'synthetic',role:'USER'}}}; export const useSession=()=>session; export const SessionProvider=({children})=>children;`,
        '@/hooks/useBalance': `export const useBalance=()=>({balance:1000,refetch:()=>{}});`,
        '@/hooks/useMaintenance': `export const useMaintenance=()=>({isMaintenanceMode:false,isLoading:false});`,
        '@/hooks/useOperationHeartbeat': `export const useOperationHeartbeat=()=>{};`,
    };
    const build = await esbuild.build({
        stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
            import Page from '@/app/dashboard/renew/page'; import {useStore} from '@/store/useStore';
            import Providers from '@/components/providers/Providers'; import LanguageSwitcher from '@/components/LanguageSwitcher';
            if(window.qaLanguage)useStore.setState({language:window.qaLanguage});
            createRoot(document.getElementById('root')).render(<Providers><LanguageSwitcher/><Page/></Providers>);`, loader: 'tsx', resolveDir: repo },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [{ name: 'isolated-runtime', setup(b) {
            b.onResolve({ filter: /^(next\/navigation|next-auth\/react|@\/hooks\/(useBalance|useMaintenance|useOperationHeartbeat))$/ }, a => ({ path: a.path, namespace: 'fixture' }));
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: mocks[a.path], loader: 'js' }));
        } }],
    });
    const css = (await require('postcss')([require('@tailwindcss/postcss')({ base: repo })])
        .process(fs.readFileSync('src/app/globals.css', 'utf8'), { from: path.join(repo, 'src/app/globals.css') })).css;
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const results = [];
    try {
        const page = await browser.newPage();
        const errors = [], unexpected = [];
        page.on('pageerror', error => errors.push(error.message));
        const start = Date.parse('2026-10-12T12:00:00Z');
        await page.clock.install({ time: start });
        let expires = start + 300_000;
        let blockedPosts = 0;
        let operationStatus = null;
        await page.route('**/*', async route => {
            const url = new URL(route.request().url());
            if (url.origin !== 'http://cooldown.invalid') {
                unexpected.push(url.origin); return route.abort();
            }
            if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body:
                `<!doctype html><html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
                <body class="bg-background text-foreground"><main id="root" style="max-width:960px;margin:auto;padding:16px"></main></body></html>` });
            if (url.pathname === '/api/operations/synthetic/packages') return route.fulfill({ json: {
                status: operationStatus === 'REFUND_PENDING' ? 'FAILED' : operationStatus,
                settlementState: operationStatus === 'REFUND_PENDING' ? 'REFUND_PENDING' : undefined,
                selectedPackage: { name: 'Premium 6 Months + 20% OFF (6 Months)', price: 86.4, quoteRevision: 1 },
                finalConfirmExpiry: new Date((await page.evaluate(() => Date.now())) + 120_000).toISOString(),
                message: 'UNTRANSLATED PROVIDER FAILURE', messageKey: operationStatus === 'REVIEW_REQUIRED' ? 'operations.providerChargedFulfillmentUnderReview' : undefined,
            } });
            if (url.pathname === '/api/operations/synthetic/confirm-purchase') {
                operationStatus = 'COMPLETED'; return route.fulfill({ json: { success: true } });
            }
            if (url.pathname === '/api/operations/start-renewal') {
                const now = await page.evaluate(() => Date.now());
                const cardNumber = route.request().method() === 'POST'
                    ? route.request().postDataJSON().cardNumber : url.searchParams.get('cardNumber');
                const active = cardNumber === '7000000001' && expires > now;
                const snapshot = { cardNumber, serverNow: new Date(now).toISOString(),
                    cooldownUntil: active ? new Date(expires).toISOString() : null,
                    remainingSeconds: active ? Math.ceil((expires - now) / 1000) : 0 };
                if (route.request().method() === 'POST') {
                    blockedPosts++;
                    return route.fulfill({ status: 409, json: { ...snapshot, code: 'RENEWAL_CARD_COOLDOWN' } });
                }
                return route.fulfill({ json: snapshot });
            }
            if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204 });
            unexpected.push(url.pathname); return route.abort();
        });
        async function render(language, width, status = null) {
            operationStatus = status;
            await page.setViewportSize({ width, height: 900 });
            await page.goto('http://cooldown.invalid/' + (status ? '?operationId=synthetic' : ''));
            await page.evaluate(language => { window.qaLanguage = language; }, language);
            await page.addScriptTag({ content: build.outputFiles[0].text });
            if (!status) await page.locator('#cardNumber').waitFor();
        }
        for (const language of ['ar', 'en', 'bn']) {
            for (const width of [360, 1280]) {
                expires = (await page.evaluate(() => Date.now())) + 300_000;
                await render(language, width);
                assert.equal(await page.locator('h1').innerText(), translations[language].renew.title);
                await page.locator('#cardNumber').fill('7000000001');
                await page.clock.runFor(350);
                await page.getByRole('timer').waitFor();
                assert.equal(await page.getByRole('button', { name: translations[language].renew.cardInput.button, exact: true }).isDisabled(), true);
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                if (language === 'ar') await page.screenshot({ path: path.join(output, `arabic-${width}.png`), fullPage: true });
                results.push(`countdown and disabled renewal: ${language} ${width}`);
            }
        }
        await page.clock.fastForward(120_000);
        await page.clock.runFor(50);
        assert.match(await page.getByRole('timer').innerText(), /^0[23]:/);
        const deadlineBeforeReload = expires;
        await render('ar', 360);
        await page.locator('#cardNumber').fill('7000000001');
        await page.clock.runFor(350);
        await page.getByRole('timer').waitFor();
        assert.match(await page.getByRole('timer').innerText(), /^0[23]:/);
        assert.equal(expires, deadlineBeforeReload);
        results.push('reload preserves remaining time');
        await page.locator('#cardNumber').fill('7000000002');
        await page.clock.runFor(350);
        assert.equal(await page.getByRole('timer').count(), 0);
        assert.equal(await page.getByRole('button', { name: translations.ar.renew.cardInput.button, exact: true }).isEnabled(), true);
        results.push('different card has no inherited timer');
        await page.locator('#cardNumber').fill('7000000001');
        await page.clock.runFor(350);
        await page.getByRole('timer').waitFor();
        await page.clock.fastForward(181_000);
        await page.clock.runFor(50);
        assert.equal(await page.getByRole('timer').count(), 0);
        assert.equal(await page.getByRole('button', { name: translations.ar.renew.cardInput.button, exact: true }).isEnabled(), true);
        results.push('expiry unlocks the control without a new request');
        // Another actor finishes an attempt before the next poll: POST must still
        // return the server cooldown and the actual page must display it.
        expires = (await page.evaluate(() => Date.now())) + 300_000;
        await page.getByRole('button', { name: translations.ar.renew.cardInput.button, exact: true }).click();
        await page.getByRole('timer').waitFor();
        assert.equal(blockedPosts, 1);
        assert.equal(await page.getByRole('button', { name: translations.ar.renew.cardInput.button, exact: true }).isDisabled(), true);
        results.push('server rejection updates stale UI without starting a job');
        // Use the actual switcher, store persistence and document direction sync.
        for (const [language, label] of [['en', 'English'], ['bn', 'বাংলা'], ['ar', 'العربية']]) {
            const previous = await page.evaluate(() => document.documentElement.lang);
            await page.getByRole('button', { name: translations[previous].header.selectLanguage, exact: true }).click();
            await page.getByRole('button', { name: new RegExp(label) }).click();
            assert.equal(await page.locator('h1').innerText(), translations[language].renew.title);
            assert.equal(await page.title(), translations[language].renew.title + ' | Desh Panel');
            assert.equal(await page.locator('html').getAttribute('dir'), language === 'ar' ? 'rtl' : 'ltr');
            await render(null, 360);
            assert.equal(await page.locator('h1').innerText(), translations[language].renew.title);
            assert.equal(await page.locator('html').getAttribute('lang'), language);
            results.push('language switch and persisted reload: ' + language);
        }
        for (const language of ['en', 'ar', 'bn']) {
            for (const width of [360, 1280]) {
                await render(language, width, 'AWAITING_FINAL_CONFIRM');
                await page.getByText(translations[language].renew.finalConfirm.title, { exact: true }).waitFor();
                await page.getByText(translations[language].renew.feedback.paymentWarning, { exact: true }).waitFor();
                assert.ok((await page.locator('main').innerText()).includes('Premium 6 Months + 20% OFF (6 Months)'));
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
                if (width === 360) await page.screenshot({ path: path.join(output, `confirmation-${language}.png`), fullPage: true });
                await page.getByRole('button', { name: translations[language].renew.finalConfirm.confirm, exact: true }).click();
                await page.getByRole('heading', { name: translations[language].renew.result.success, exact: true }).waitFor();
                results.push('localized confirmation and final result: ' + language + ' ' + width);
            }
            for (const status of ['FAILED', 'REVIEW_REQUIRED', 'REFUND_PENDING']) {
                await render(language, 360, status);
                await page.getByRole('heading', { name: status === 'REVIEW_REQUIRED' ? translations[language].panelUi.reviewRequired : status === 'REFUND_PENDING' ? translations[language].panelUi.pendingSettlement : translations[language].renew.result.failed, exact: true }).waitFor();
                if (status === 'REVIEW_REQUIRED') await page.getByText(translations[language].operations.providerChargedFulfillmentUnderReview, { exact: true }).waitFor();
                if (status === 'REFUND_PENDING') await page.getByText(translations[language].operations.refundSettlementPending, { exact: true }).waitFor();
                assert.ok(!(await page.locator('main').innerText()).includes('UNTRANSLATED PROVIDER FAILURE'));
                results.push('localized terminal feedback: ' + language + ' ' + status);
            }
        }
        await page.getByRole('button', { name: translations.bn.header.selectLanguage, exact: true }).click();
        await page.getByRole('button', { name: /English/ }).click();
        await page.getByRole('heading', { name: translations.en.panelUi.pendingSettlement, exact: true }).waitFor();
        await page.getByText(translations.en.operations.refundSettlementPending, { exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, 'pending-settlement-en.png'), fullPage: true });
        results.push('terminal heading and feedback follow live language switch');
        assert.deepEqual(errors, []);
        assert.deepEqual(unexpected, []);
        console.log(JSON.stringify({ results, externalRequests: 0, realOperations: 0, errors }, null, 2));
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
