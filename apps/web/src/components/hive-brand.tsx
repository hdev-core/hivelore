import Image from "next/image";

type HiveBrandProps = {
  variant?: "mark" | "lockup";
  className?: string;
};

const assets = {
  mark: {
    src: "/brands/hive/hextacular.svg",
    width: 220,
    height: 190,
    alt: "Hive mark",
  },
  lockup: {
    src: "/brands/hive/horizontal.svg",
    width: 835,
    height: 190,
    alt: "Hive",
  },
};

export function HiveBrand({ variant = "mark", className }: HiveBrandProps) {
  const asset = assets[variant];
  const classes = ["hive-brand", `hive-brand--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      <Image
        src={asset.src}
        width={asset.width}
        height={asset.height}
        alt={asset.alt}
        priority={variant === "mark"}
      />
    </span>
  );
}
