"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import AccessDenied from "./AccessDenied"
import { Skeleton } from "@/components/ui/Skeleton"

const ROLE_HIERARCHY: Record<string, number> = {
    ADMIN: 3,
    MANAGER: 2,
    USER: 1
}

interface ProtectedRouteProps {
    children: React.ReactNode
    allowedRoles: string[] // Accept any role string, will be compared case-insensitively
    fallback?: React.ReactNode
}

export default function ProtectedRoute({
    children,
    allowedRoles,
    fallback
}: ProtectedRouteProps) {
    const { data: session, status } = useSession()
    const router = useRouter()

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login")
        }
    }, [status, router])

    if (status === "loading") {
        return (
            <div className="space-y-4 p-4">
                <Skeleton className="h-12 w-3/4" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-32 w-full" />
            </div>
        )
    }

    if (status === "unauthenticated") {
        return null // Will redirect in useEffect
    }

    const userRole = session?.user?.role?.toUpperCase() || ''

    // Function to check if user has permission
    // We check if the user's role matches ANY of the allowed roles
    // OR if the user's role is higher in hierarchy (RBAC style)
    // For this specific implementation, we will stick to exact matches or hierarchy depending on intent.
    // Usually "allowedRoles=['MANAGER']" means Manager OR HIGHER (Admin).

    const hasPermission = () => {
        if (!userRole) return false;

        // Normalize allowed roles to uppercase for comparison
        const normalizedAllowedRoles = allowedRoles.map(r => r.toUpperCase())

        // Check direct inclusion first
        if (normalizedAllowedRoles.includes(userRole)) return true;

        // Check hierarchy
        // If we passed ['MANAGER'], we essentially mean "At least MANAGER"
        // So we find the minimum required level from the allowed array
        let requiredLevel = 0
        allowedRoles.forEach(role => {
            const level = ROLE_HIERARCHY[role.toUpperCase()] || 0
            if (level > requiredLevel) requiredLevel = level // Wait, usually we want the MINIMUM allowed? 
            // Actually, if I say allowedRoles=['MANAGER'], and I am ADMIN(3) and MANAGER(2).
            // If I pass ['MANAGER'], acceptable is >= 2.
            // If I pass ['USER'], acceptable is >= 1.
            // So we take the lowest level in the allowed list as the "base" requirement?
            // Or do we treat allowedRoles as an explicit list?
            // Let's implement robust "At least" logic.
            // If allowedRoles contains 'MANAGER', it implies Manager+
        })

        // Re-evaluating: explicitly use min required level based on what's passed?
        // Let's simplify: 
        // If I pass ['MANAGER'], I assume I want Manager access.
        // Admin > Manager > User.
        // If I correspond the role string to a level, check if userLevel >= requiredLevel.

        // We will assume allowedRoles contains the "minimum" role needed, picked from the list.
        // But usually allowedRoles is just a list of roles. 
        // Let's iterate: if userRole level >= any of the allowedRoles levels, permit?
        // Example: Allowed=['MANAGER']. User=ADMIN. Level(3) >= Level(2). OK.
        // Example: Allowed=['USER']. User=ADMIN. Level(3) >= Level(1). OK.

        const userLevel = ROLE_HIERARCHY[userRole] || 0

        return allowedRoles.some(role => {
            const allowedLevel = ROLE_HIERARCHY[role.toUpperCase()] || 0
            return userLevel >= allowedLevel
        })
    }

    if (!hasPermission()) {
        return fallback || <AccessDenied />
    }

    return <>{children}</>
}
