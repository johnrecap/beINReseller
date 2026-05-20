import { cn } from '@/lib/utils'

interface BrandLogoProps {
    className?: string
    imageClassName?: string
    compact?: boolean
}

export default function BrandLogo({ className, imageClassName, compact = false }: BrandLogoProps) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-xl border border-[#a3ff12]/20 bg-black shadow-[0_0_28px_rgba(163,255,18,0.16)]',
                className
            )}
        >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#a3ff12]/10 via-transparent to-[#8f2cff]/15" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/images/desh-panel-brand.jpeg"
                alt="Desh Panel"
                className={cn(
                    'relative h-full w-full object-cover',
                    compact && 'object-center',
                    imageClassName
                )}
            />
        </div>
    )
}
