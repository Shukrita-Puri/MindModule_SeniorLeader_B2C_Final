/**
 * Share an insight card view as a PNG snapshot via the native iOS Share Sheet
 * (AirDrop, Messages, Mail, WhatsApp, Notes, Copy — all routed through iOS).
 * Web fallback uses navigator.share when available, otherwise clipboard.
 */
import { toPng } from 'html-to-image';
import { Capacitor } from '@capacitor/core';
import { toast } from '@/hooks/use-toast';

interface ShareOpts {
  node: HTMLElement;
  title: string;
  text?: string;
  fileName?: string;
}

async function snapshotPng(node: HTMLElement): Promise<string> {
  // Returns base64 data URL (image/png)
  return await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    skipFonts: true,
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

export async function shareInsightCard({ node, title, text, fileName = 'mind-module-insight.png' }: ShareOpts) {
  try {
    const dataUrl = await snapshotPng(node);

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

      await Share.share({
        title,
        text: text ?? title,
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
      await nav.share({ title, text: text ?? title, files: [file] });
      return;
    }

    // Clipboard fallback
    if (navigator.clipboard && 'write' in navigator.clipboard) {
      // @ts-expect-error – ClipboardItem types vary across browsers
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
  }
}