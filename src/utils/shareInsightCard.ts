/**
 * Share an insight card view as a PNG snapshot via the native iOS Share Sheet
 * (AirDrop, Messages, Mail, WhatsApp, Notes, Copy — all routed through iOS).
 * Web fallback uses navigator.share when available, otherwise clipboard.
 */
import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';
import { toast } from '@/hooks/use-toast';
import { setShareCapture, nextPaint } from '@/utils/shareCaptureMode';


interface ShareOpts {
  node: HTMLElement;
  title: string;
  text?: string;
  fileName?: string;
}

function inlineCssVariables(node: HTMLElement): () => void {
  const allEls = [node, ...Array.from(node.querySelectorAll<HTMLElement>('*'))];
  const restoreFns: Array<() => void> = [];

  for (const el of allEls) {
    const computed = getComputedStyle(el);
    const style = el.style;
    const previous = {
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderColor: style.borderColor,
    };

    const bg = computed.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      style.backgroundColor = bg;
    }
    if (computed.color) style.color = computed.color;
    if (computed.borderColor) style.borderColor = computed.borderColor;

    restoreFns.push(() => {
      style.backgroundColor = previous.backgroundColor;
      style.color = previous.color;
      style.borderColor = previous.borderColor;
    });
  }

  return () => restoreFns.forEach((restore) => restore());
}

async function snapshotPng(node: HTMLElement): Promise<string> {
  // Hide any in-card chrome marked [data-share-hide] (e.g. the Share button
  // itself) during capture so the affordance doesn't appear in the exported PNG.
  const hidden = Array.from(node.querySelectorAll<HTMLElement>('[data-share-hide]'));
  const prevVisibility = hidden.map(el => el.style.visibility);
  hidden.forEach(el => { el.style.visibility = 'hidden'; });

  const shareOnly = Array.from(node.querySelectorAll<HTMLElement>('[data-share-only]'));
  const prevShareOnlyDisplay = shareOnly.map((el) => el.style.display);
  shareOnly.forEach((el) => { el.style.display = ''; });

  const blurEls = Array.from(node.querySelectorAll<HTMLElement>('[class*="backdrop-blur"]'));
  const prevBlur = blurEls.map((el) => ({
    backdropFilter: el.style.backdropFilter,
    webkitBackdropFilter: (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter ?? '',
  }));
  blurEls.forEach((el) => {
    el.style.backdropFilter = 'none';
    (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
  });

  // Coloured pill glows ("boxShadow: 0 2px 6px rgba(...)") and inline pinned
  // day-column widths are tuned for the on-screen scrolling strip. Once the
  // scroller is expanded for capture they trail sideways and read as a washed
  // out / ghosted chart in the exported PNG. Neutralise both for the snapshot.
  const glowEls = Array.from(node.querySelectorAll<HTMLElement>('*')).filter(
    (el) => !!el.style.boxShadow,
  );
  const prevGlow = glowEls.map((el) => el.style.boxShadow);
  glowEls.forEach((el) => { el.style.boxShadow = 'none'; });

  const pinnedCols = Array.from(node.querySelectorAll<HTMLElement>('[data-day-col]'));
  const prevPinned = pinnedCols.map((el) => ({ width: el.style.width, minWidth: el.style.minWidth }));
  pinnedCols.forEach((el) => { el.style.width = ''; el.style.minWidth = ''; });

  const restoreCssVars = inlineCssVariables(node);


  // Expand real scroll containers inside the captured tree so the snapshot
  // includes the FULL intrinsic content (e.g. the entire month-wide Rhythm
  // calendar, not just the visible week). Preserve overflow:hidden elements
  // used only for border-radius clipping.
  const scrollables: HTMLElement[] = [];
  node.querySelectorAll<HTMLElement>('*').forEach(el => {
    const cs = getComputedStyle(el);
    const isScrollable = /(auto|scroll)/.test(cs.overflow + cs.overflowX + cs.overflowY);
    const hasScrollableContent = el.scrollHeight > el.clientHeight + 4 || el.scrollWidth > el.clientWidth + 4;
    if (isScrollable && hasScrollableContent) {
      scrollables.push(el);
    }
  });
  const prevStyles = scrollables.map(el => ({
    overflow: el.style.overflow,
    overflowX: el.style.overflowX,
    overflowY: el.style.overflowY,
    maxHeight: el.style.maxHeight,
    maxWidth: el.style.maxWidth,
    height: el.style.height,
    width: el.style.width,
    scrollLeft: el.scrollLeft,
    scrollTop: el.scrollTop,
  }));
  scrollables.forEach(el => {
    el.style.overflow = 'visible';
    el.style.overflowX = 'visible';
    el.style.overflowY = 'visible';
    el.style.maxHeight = 'none';
    el.style.maxWidth = 'none';
    el.style.height = 'auto';
  });

  const prevNodeBg = node.style.backgroundColor;
  const prevNodePad = node.style.padding;
  node.style.backgroundColor = '#ffffff';
  node.style.padding = '16px';

  // Force a layout pass before measuring scrollWidth/Height.
  void node.offsetHeight;
  const fullWidth = Math.max(node.scrollWidth, node.offsetWidth);
  const fullHeight = Math.max(node.scrollHeight, node.offsetHeight);

  try {
    return await toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: false,
      width: fullWidth,
      height: fullHeight,
      style: {
        width: `${fullWidth}px`,
        height: `${fullHeight}px`,
      },
    });
  } finally {
    node.style.backgroundColor = prevNodeBg;
    node.style.padding = prevNodePad;
    restoreCssVars();
    blurEls.forEach((el, i) => {
      el.style.backdropFilter = prevBlur[i].backdropFilter;
      (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = prevBlur[i].webkitBackdropFilter;
    });
    shareOnly.forEach((el, i) => { el.style.display = prevShareOnlyDisplay[i]; });
    scrollables.forEach((el, i) => {
      const p = prevStyles[i];
      el.style.overflow = p.overflow;
      el.style.overflowX = p.overflowX;
      el.style.overflowY = p.overflowY;
      el.style.maxHeight = p.maxHeight;
      el.style.maxWidth = p.maxWidth;
      el.style.height = p.height;
      el.style.width = p.width;
      el.scrollLeft = p.scrollLeft;
      el.scrollTop = p.scrollTop;
    });
    pinnedCols.forEach((el, i) => {
      el.style.width = prevPinned[i].width;
      el.style.minWidth = prevPinned[i].minWidth;
    });
    glowEls.forEach((el, i) => { el.style.boxShadow = prevGlow[i]; });
    hidden.forEach((el, i) => { el.style.visibility = prevVisibility[i]; });
  }
}


function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

let shareInFlight = false;

export async function shareInsightCard({ node, title, text, fileName = 'mind-module-insight.png' }: ShareOpts) {
  // Single-flight: a second activation while a capture/share is running would
  // produce a duplicate attachment in the share sheet.
  if (shareInFlight) return;
  shareInFlight = true;
  try {
    // Switch cards into their export layout (e.g. vertical month calendar),
    // let React paint, then snapshot.
    setShareCapture(true);
    await nextPaint();
    let dataUrl: string;
    try {
      dataUrl = await snapshotPng(node);
    } finally {
      setShareCapture(false);
    }

    // Native (iOS / Android): write to filesystem then invoke native share sheet
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');

      const base64 = dataUrl.split(',')[1];
      const written = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });

      // Exactly ONE attachment: the image. Passing `text` alongside `files`
      // makes some targets (WhatsApp) render a second item.
      await Share.share({
        title,
        files: [written.uri],
        dialogTitle: 'Share insight',
      });
      return;
    }

    // Web: prefer navigator.share with file payload
    const blob = dataUrlToBlob(dataUrl);
    const file = new File([blob], fileName, { type: 'image/png' });

    const nav = navigator as Navigator & {
      canShare?: (data: { files: File[] }) => boolean;
      share?: (data: ShareData & { files?: File[] }) => Promise<void>;
    };

    if (nav.share && nav.canShare?.({ files: [file] })) {
      await nav.share({ title, files: [file] });
      return;
    }


    // Clipboard fallback
    if (navigator.clipboard && 'write' in navigator.clipboard) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast({ title: 'Image copied', description: 'Paste it into any chat or email.' });
      return;
    }

    // Last resort: trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[shareInsightCard] error:', err);
    if ((err as { message?: string })?.message?.toLowerCase?.().includes('cancel')) return;
    toast({ title: 'Share failed', description: 'Please try again.', variant: 'destructive' });
  } finally {
    setShareCapture(false);
    shareInFlight = false;
  }
}

