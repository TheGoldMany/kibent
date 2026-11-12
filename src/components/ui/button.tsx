import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold font-wide focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Fő művelet: vaj sárga, tinta keret, kemény árnyék
        default: "press border-2 border-ink bg-butter text-ink shadow-brutal-sm hover:bg-butter-deep",
        destructive: "press border-2 border-ink bg-bubblegum text-ink shadow-brutal-sm hover:bg-[#ff9fcb]",
        outline: "press border-2 border-ink bg-white text-ink shadow-brutal-xs hover:bg-lilac-soft",
        secondary: "press border-2 border-ink bg-lilac text-ink shadow-brutal-xs hover:bg-[#cfb8ff]",
        ghost: "rounded-full text-ink hover:bg-lilac-soft",
        link: "font-normal text-ink underline decoration-2 underline-offset-4 hover:decoration-butter-deep",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3.5 text-[13px]",
        lg: "h-12 px-7 text-base",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
