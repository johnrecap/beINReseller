'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface VideoFrameProps {
    videoSrc?: string
    className?: string
    showReflection?: boolean
}

export function VideoFrame({
    videoSrc = '/videos/promo.mp4',
    className,
    showReflection = true
}: VideoFrameProps) {
    return (
        <div className={cn("relative w-full flex flex-col items-center", className)}>
            {/* 
                Floating Animation Container 
                Animate y-axis to create a bobbing "alive" effect
            */}
            <motion.div
                animate={{
                    y: [0, -8, 0]
                }}
                transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut"
                }}
                className="relative z-10 w-full"
            >
                {/* 
                    Retro-Modern TV Frame 
                    Double border effect: 
                    1. Rotating gradient border (via rotating-border class)
                    2. Clean inner dark frame
                */}
                <div className="relative p-[3px] rounded-2xl rotating-border overflow-hidden shadow-2xl">
                    <div className="relative bg-zinc-950 rounded-xl overflow-hidden shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] border border-white/5">

                        {/* 
                            RESPONSIVE VIDEO CONTAINER
                            max-w-full ensures it fits in card.
                            aspect-ratio: auto lets the video dictate the height.
                            object-fit: cover fills the frame without distortion.
                        */}
                        <video
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="w-full max-w-full h-auto object-cover opacity-90 hover:opacity-100 transition-opacity duration-500"
                            style={{
                                aspectRatio: "auto",
                                minHeight: "200px",  // Fallback height if video fails/loads slow
                                maxHeight: "400px"   // Prevent it from becoming too tall on mobile
                            }}
                        >
                            <source src={videoSrc} type="video/mp4" />
                            <source src={videoSrc.replace('.mp4', '.webm')} type="video/webm" />
                            {/* Fallback for no video */}
                            <div className="w-full h-64 bg-zinc-900 flex items-center justify-center text-zinc-700">
                                No Signal
                            </div>
                        </video>

                        {/* Monitor Glare / Scanlines Overlay (Optional cinematic touch) */}
                        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%] pointer-events-none opacity-20" />

                        {/* Screen Vignette */}
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)] pointer-events-none z-20" />
                    </div>
                </div>
            </motion.div>

            {/* Reflection Effect */}
            {showReflection && (
                <motion.div
                    className="absolute -bottom-6 left-0 right-0 h-16 pointer-events-none z-0 video-reflection opacity-40 scale-y-[-1] blur-sm transform-gpu"
                    animate={{
                        y: [0, 8, 0], // Inverse movement for reflection realism
                        opacity: [0.3, 0.4, 0.3]
                    }}
                    transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: "easeInOut"
                    }}
                >
                    {/* 
                        We duplicate video structure for CSS-free reflection control if needed, 
                        but pure CSS properties are cleaner. globals.css handles .video-reflection.
                        This div just acts as the container if we needed manual duplication.
                        For now, the globals.css reflection handles the visual. 
                        We keep this div structure to apply the matching bob animation inversely.
                     */}
                </motion.div>
            )}
        </div>
    )
}
