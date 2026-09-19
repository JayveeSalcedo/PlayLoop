import React from "react";
import { icon, coinSVG, type IconName } from "@playloop/ui";

export { icon, coinSVG, type IconName };

export interface CoinProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg" | "xl" | number;
  className?: string;
  variant?: "badge" | "svg";
}

/**
 * Neobrutalist Coin / Points icon component.
 *
 * Renders either the neobrutalist CSS coin badge (.coin with inner ring)
 * or an inline vector SVG (<circle> with inner concentric rings and pip).
 */
export function Coin({
  size = "sm",
  className = "",
  variant = "badge",
  ...rest
}: CoinProps): React.ReactElement {
  if (typeof size === "number") {
    if (variant === "svg") {
      return React.createElement(
        "svg",
        {
          className: `coin-svg ${className}`.trim(),
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          "aria-hidden": true,
          ...rest,
        },
        React.createElement("circle", { cx: 12, cy: 12, r: 9.5, fill: "#FFDD3C", stroke: "#18123F", strokeWidth: 2.2 }),
        React.createElement("circle", { cx: 12, cy: 12, r: 6, fill: "none", stroke: "#18123F", strokeWidth: 1.6, opacity: 0.45 }),
        React.createElement("circle", { cx: 12, cy: 12, r: 2.8, fill: "#18123F", stroke: "none", opacity: 0.3 }),
      );
    }
    return React.createElement("span", {
      className: `coin ${className}`.trim(),
      style: { width: size, height: size, ...rest.style },
      "aria-hidden": true,
      ...rest,
    });
  }

  const sizeClass =
    size === "md" ? "coin md" : size === "lg" ? "coin lg" : size === "xl" ? "coin xl" : "coin sm";

  if (variant === "svg") {
    const px = size === "sm" ? 18 : size === "md" ? 26 : size === "lg" ? 40 : 56;
    return React.createElement(
      "svg",
      {
        className: `coin-svg ${className}`.trim(),
        width: px,
        height: px,
        viewBox: "0 0 24 24",
        fill: "none",
        "aria-hidden": true,
        ...rest,
      },
      React.createElement("circle", { cx: 12, cy: 12, r: 9.5, fill: "#FFDD3C", stroke: "#18123F", strokeWidth: 2.2 }),
      React.createElement("circle", { cx: 12, cy: 12, r: 6, fill: "none", stroke: "#18123F", strokeWidth: 1.6, opacity: 0.45 }),
      React.createElement("circle", { cx: 12, cy: 12, r: 2.8, fill: "#18123F", stroke: "none", opacity: 0.3 }),
    );
  }

  return React.createElement("span", {
    className: `${sizeClass} ${className}`.trim(),
    "aria-hidden": true,
    ...rest,
  });
}

/**
 * Standardized Points + Coin Badge for UI pills, stats, and rewards.
 */
export function CoinBadge({
  amount,
  label = "pts",
  size = "sm",
  className = "",
}: {
  amount: number | string;
  label?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}): React.ReactElement<{ className?: string }> {
  const formatted = typeof amount === "number" ? amount.toLocaleString("en-US") : amount;
  return React.createElement(
    "span",
    {
      className: `inline-flex items-center gap-1.5 font-extrabold text-ink ${className}`.trim(),
    },
    React.createElement(Coin, { size }),
    React.createElement("span", null, `${formatted}${label ? ` ${label}` : ""}`),
  );
}
