#!/usr/bin/env python3
"""Encode a product recording as a GIF and build email signature HTML."""
import argparse
import html
import json
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit


def run(args):
    return subprocess.run([str(a) for a in args], check=True, capture_output=True, text=True)


def https(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
        raise argparse.ArgumentTypeError('Use a public HTTPS URL without credentials')
    return value


def positive(value):
    n = int(value)
    if n <= 0:
        raise argparse.ArgumentTypeError('Must be positive')
    return n


def encode(source, out, width, fps, seconds, concat=False):
    input_args = ['-f', 'concat', '-safe', '0'] if concat else []
    filters = f'fps={fps},scale={width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer'
    run(['ffmpeg', '-v', 'error', *input_args, '-i', source, '-t', str(seconds),
         '-filter_complex', filters, '-loop', '0', out / 'demo.gif'])
    run(['ffmpeg', '-v', 'error', '-i', out / 'demo.gif', '-frames:v', '1', out / 'poster.png'])
    size = (out / 'demo.gif').stat().st_size
    report = {'gif_bytes': size, 'target_bytes': 1_000_000, 'within_budget': size <= 1_000_000,
              'width': width, 'fps': fps, 'maximum_seconds': seconds}
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report))
    if size > 1_000_000:
        print('Over budget: reduce duration, width, or FPS and encode into a new directory.')


def signature(args, out):
    escape = lambda s: html.escape(s, quote=True)
    def document(image):
        return f'''<!doctype html><html><head><meta charset="utf-8"><title>Email signature</title></head><body>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;color:#202124;">
<tr><td style="font-size:16px;font-weight:bold;padding-bottom:4px;">{escape(args.name)}</td></tr>
<tr><td style="font-size:12px;padding-bottom:12px;">{escape(args.role)}</td></tr>
<tr><td><a href="{escape(args.link)}"><img src="{escape(image)}" width="{args.width}" height="{args.height}" alt="{escape(args.alt)}" border="0" style="display:block;width:{args.width}px;max-width:100%;height:auto;border:0;"></a></td></tr>
<tr><td style="padding-top:8px;font-size:12px;"><a href="{escape(args.link)}" style="color:#0969da;">Watch the demo →</a></td></tr>
</table></body></html>
'''
    outputs = {'signature.html': document(args.gif_url),
               'signature-static.html': document(args.poster_url),
               'signature.txt': f'{args.name}\n{args.role}\nWatch the demo: {args.link}\n'}
    if any((out / name).exists() for name in outputs):
        raise ValueError('Signature output already exists; choose a new output directory')
    out.mkdir(parents=True, exist_ok=True)
    for name, content in outputs.items():
        (out / name).write_text(content)
    print(f'Created signature files in {out}. Verify hosted assets before installing.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='mode', required=True)
    for name in ('encode',):
        sub = commands.add_parser(name)
        sub.add_argument('video')
        sub.add_argument('output')
        sub.add_argument('--width', type=positive, default=400)
        sub.add_argument('--fps', type=positive, default=8)
        sub.add_argument('--seconds', type=positive, default=12)
    sub = commands.add_parser('signature')
    sub.add_argument('output')
    for name in ('name', 'role', 'alt'):
        sub.add_argument('--' + name, required=True)
    for name in ('link', 'gif-url', 'poster-url'):
        sub.add_argument('--' + name, required=True, type=https)
    sub.add_argument('--width', type=positive, default=400)
    sub.add_argument('--height', type=positive, required=True)
    args = parser.parse_args()
    out = Path(args.output).resolve()
    if args.mode == 'signature':
        signature(args, out)
    else:
        if not shutil.which('ffmpeg'):
            parser.error('FFmpeg is required; install it before recording or encoding')
        out.mkdir(parents=True, exist_ok=False)
        encode(Path(args.video).resolve(), out, args.width, args.fps, args.seconds)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.CalledProcessError) as exc:
        raise SystemExit(getattr(exc, 'stderr', None) or str(exc))
