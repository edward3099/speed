"use client"

import React, { ComponentPropsWithoutRef, CSSProperties } from "react"

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<"button"> {
  shimmerColor?: string
  shimmerSize?: string
  borderRadius?: string
  shimmerDuration?: string
  background?: string
  className?: string
  children?: React.ReactNode
  active?: boolean
}

export const ShimmerButton = React.forwardRef<
  HTMLButtonElement,
  ShimmerButtonProps
>(
  (
    {
      shimmerColor = "#5eead4",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "12px",
      background = "rgba(255, 255, 255, 0.1)",
      className,
      children,
      active = false,
      ...props
    },
    ref
  ) => {
    const activeBg = active ? "rgba(94, 234, 212, 1)" : background
    const activeText = active ? "text-black" : "text-white"

    return (
      <button
        style={{
          ...(props.style || {}),
          "--spread": "90deg",
          "--shimmer-color": shimmerColor,
          "--radius": borderRadius,
          "--speed": shimmerDuration,
          "--cut": shimmerSize,
          "--bg": activeBg,
        } as CSSProperties}
        className={`group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden border border-white/10 px-5 py-2.5 whitespace-nowrap text-sm font-semibold transform-gpu transition-all duration-300 ease-in-out active:scale-95 rounded-xl ${active ? "bg-teal-300 text-black" : activeText} ${className || ""}`}
        ref={ref}
        {...props}
      >
        {/* spark container */}
        {!active && (
          <div
            className="absolute inset-0 -z-30 overflow-visible blur-[2px]"
          >
            {/* spark */}
            <div className="absolute inset-0 h-full w-full animate-shimmer-slide">
              {/* spark before */}
              <div 
                className="absolute -inset-full w-auto rotate-0"
                style={{
                  background: `conic-gradient(from calc(270deg - (var(--spread) * 0.5)), transparent 0, var(--shimmer-color) var(--spread), transparent var(--spread))`
                }}
              />
            </div>
          </div>
        )}
        {children}

        {/* Highlight */}
        {!active && (
          <div
            className="absolute inset-0 size-full rounded-xl px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f] transform-gpu transition-all duration-300 ease-in-out group-hover:shadow-[inset_0_-6px_10px_#ffffff3f] group-active:shadow-[inset_0_-10px_10px_#ffffff3f]"
          />
        )}

        {/* backdrop */}
        {!active && (
          <div
            className="absolute -z-20"
            style={{
              inset: "var(--cut)",
              borderRadius: "var(--radius)",
              background: "var(--bg)"
            }}
          />
        )}
      </button>
    )
  }
)

ShimmerButton.displayName = "ShimmerButton"

