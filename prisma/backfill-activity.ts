/**
 * Activity Data Backfill Script
 * 
 * This script backfills the new activity tracking fields for existing users:
 * - loginCount: Calculated from activity logs with LOGIN action
 * - totalOperations: Count of COMPLETED operations
 * - lastOperationAt: Most recent completed operation timestamp
 * 
 * Run with: npx tsx prisma/backfill-activity.ts
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

// Create PostgreSQL pool
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
})

// Create Prisma adapter
const adapter = new PrismaPg(pool)

// Create Prisma client with adapter
const prisma = new PrismaClient({ adapter })

async function backfillActivityData() {
    console.log('Starting activity data backfill...')
    console.log('=====================================\n')
    
    try {
        // Get all users
        const users = await prisma.user.findMany({
            select: { id: true, username: true }
        })
        
        console.log(`Found ${users.length} users to process\n`)
        
        let processed = 0
        let errors = 0
        
        for (const user of users) {
            try {
                // Calculate login count from activity logs
                const loginCount = await prisma.activityLog.count({
                    where: {
                        userId: user.id,
                        action: {
                            in: ['LOGIN', 'AUTH_LOGIN', 'ADMIN_LOGIN']
                        }
                    }
                })
                
                // Get last operation date and total count (COMPLETED only)
                const operationStats = await prisma.operation.aggregate({
                    where: {
                        userId: user.id,
                        status: 'COMPLETED'
                    },
                    _count: true,
                    _max: { completedAt: true }
                })
                
                // Update user with calculated values
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        loginCount,
                        totalOperations: operationStats._count,
                        lastOperationAt: operationStats._max.completedAt
                    }
                })
                
                processed++
                
                // Log progress every 10 users
                if (processed % 10 === 0) {
                    console.log(`Processed ${processed}/${users.length} users...`)
                }
                
                // Debug info for first few users
                if (processed <= 5) {
                    console.log(`  ${user.username}: logins=${loginCount}, operations=${operationStats._count}`)
                }
            } catch (error) {
                errors++
                console.error(`Error processing user ${user.username}:`, error)
            }
        }
        
        console.log('\n=====================================')
        console.log(`Backfill completed!`)
        console.log(`  Total users: ${users.length}`)
        console.log(`  Successfully processed: ${processed}`)
        console.log(`  Errors: ${errors}`)
        
    } catch (error) {
        console.error('Fatal error during backfill:', error)
        throw error
    } finally {
        await prisma.$disconnect()
        await pool.end()
    }
}

// Run the backfill
backfillActivityData()
    .then(() => {
        console.log('\nBackfill script finished successfully.')
        process.exit(0)
    })
    .catch((error) => {
        console.error('\nBackfill script failed:', error)
        process.exit(1)
    })
