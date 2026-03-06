import prisma from '@/lib/prisma'
import {
    BEIN_LOGIN_FAILURE_THRESHOLD_SETTING_KEY,
    normalizeBeinLoginFailureThreshold,
} from '@/lib/bein-login-failure-threshold'

export async function getBeinLoginFailureThreshold(): Promise<number> {
    const setting = await prisma.setting.findUnique({
        where: { key: BEIN_LOGIN_FAILURE_THRESHOLD_SETTING_KEY },
        select: { value: true },
    })

    return normalizeBeinLoginFailureThreshold(setting?.value)
}
