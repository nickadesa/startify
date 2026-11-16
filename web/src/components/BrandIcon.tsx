import React from "react";
import { BrandKey } from "../types/arena";

interface BrandIconProps {
  brand: BrandKey;
  size?: number;
  className?: string;
}

const BRAND_COLORS: Record<BrandKey, { bg: string; fg: string }> = {
  anthropic: { bg: "#D97757", fg: "#FFFFFF" },
  xai: { bg: "#141416", fg: "#FFFFFF" },
  deepseek: { bg: "#2563EB", fg: "#FFFFFF" },
  qwen: { bg: "#7C3AED", fg: "#FFFFFF" },
  gemini: { bg: "#0A84FF", fg: "#FFFFFF" },
  openai: { bg: "#10A37F", fg: "#FFFFFF" },
  mistral: { bg: "#F59E0B", fg: "#111111" },
  meta: { bg: "#0668E1", fg: "#FFFFFF" },
};

export const BrandIcon: React.FC<BrandIconProps> = ({ brand, size = 24, className = "" }) => {
  const palette = BRAND_COLORS[brand] || { bg: "#333333", fg: "#FFFFFF" };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 border border-white/15 shadow-xs ${className}`}
      style={{ width: `${size}px`, height: `${size}px`, backgroundColor: palette.bg, color: palette.fg }}
      title={brand.toUpperCase()}
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none">
        {brand === "anthropic" && (
          <path d="M14.2 5L19.5 19H16.6L15.4 15.8H10.1L8.9 19H6L11.3 5H14.2ZM11 13.4H14.5L12.75 8.5L11 13.4Z" fill="currentColor" />
        )}
        {brand === "xai" && (
          <path d="M5.5 5L10.8 12L5.5 19H8.3L12.2 13.8L16.1 19H18.9L13.6 12L18.9 5H16.1L12.2 10.2L8.3 5H5.5Z" fill="currentColor" />
        )}
        {brand === "deepseek" && (
          <path d="M12 3C7 3 4 7 4 12C4 17 7.5 21 12.5 21C16.5 21 19.5 18.5 20 14.5C17.5 16 15 15.5 13.5 13.5C12 11.5 13 8.5 15.5 7.5C14.5 4.8 13.5 3 12 3Z" fill="currentColor" />
        )}
        {brand === "qwen" && (
          <path d="M12 4L19 8V16L12 20L5 16V8L12 4ZM12 7.5L8 9.8V14.2L12 16.5L16 14.2V9.8L12 7.5Z" fill="currentColor" />
        )}
        {brand === "gemini" && (
          <path d="M12 2C12.8 7.6 16.4 11.2 22 12C16.4 12.8 12.8 16.4 12 22C11.2 16.4 7.6 12.8 2 12C7.6 11.2 11.2 7.6 12 2Z" fill="currentColor" />
        )}
        {brand === "openai" && (
          <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="2.4" strokeDasharray="6 3" />
        )}
        {brand === "mistral" && (
          <path d="M4 6H8V10H10V6H14V10H16V6H20V18H16V14H14V18H10V14H8V18H4V6Z" fill="currentColor" />
        )}
        {brand === "meta" && (
          <path d="M4 15.5C4 11 6.8 7.5 9.2 7.5C11 7.5 12 9.5 12 9.5C12 9.5 13 7.5 14.8 7.5C17.2 7.5 20 11 20 15.5C20 17.5 18.5 18.5 17 18.5C15.2 18.5 13.8 16.5 12 13.5C10.2 16.5 8.8 18.5 7 18.5C5.5 18.5 4 17.5 4 15.5Z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
};
