"use client";

import { motion, MotionConfig } from "framer-motion";

/**
 * The landing page's single scroll effect: one subtle fade-up per section,
 * once. Anything fancier competes with the hero — don't add variants.
 *
 * reducedMotion="user" (instead of branching on useReducedMotion) keeps SSR
 * markup identical for everyone — branching caused hydration mismatches.
 */
export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className={className}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
