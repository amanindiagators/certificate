import { useLayoutEffect, useRef } from "react";

/**
 * PrintLayout
 * - Reserves header/footer space
 * - Auto-moves blocks to next page if they don't fit
 * - Works with Playwright / Chromium
 */
export default function PrintLayout({ headerSrc, footerSrc, children }) {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const PAGE_HEIGHT_MM = 297;
    const HEADER_MM = 40;
    const FOOTER_MM = 28;
    const CONTENT_MM = PAGE_HEIGHT_MM - HEADER_MM - FOOTER_MM;

    const MM_TO_PX = 3.78;
    const MAX_HEIGHT_PX = CONTENT_MM * MM_TO_PX;

    let currentHeight = 0;

    const blocks = containerRef.current?.querySelectorAll(".page-block") || [];

    blocks.forEach((block) => {
      const blockHeight = block.offsetHeight;

      if (currentHeight + blockHeight > MAX_HEIGHT_PX) {
        block.classList.add("force-new-page");
        currentHeight = blockHeight;
      } else {
        currentHeight += blockHeight;
      }
    });
  }, []);

  return (
    <div>
      {/* Fixed Header */}
      <img src={headerSrc} className="certificate-header" alt="Header" />

      {/* Fixed Footer */}
      <img src={footerSrc} className="certificate-footer" alt="Footer" />

      {/* Safe printable content */}
      <div className="page-content" ref={containerRef}>
        {children}
      </div>
    </div>
  );
}
