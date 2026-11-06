#!/usr/bin/env python3
"""Screenshot a page through the DevTools protocol: wait for a title prefix, then capture.

    python3 shot.py <url> <out.png> [--wait READY] [--timeout 60] [--width 1440] [--height 900]

Chromium's --screenshot fires on load, before an async three.js scene has finished loading its GLBs, so this
drives the page instead: launch headless Chromium with a debugging port, poll document.title until it starts with
the wait prefix, then Page.captureScreenshot. Prints the title, the page's #log text and any console error.
"""
import argparse, base64, json, os, subprocess, sys, time, urllib.request

CHROME = '/usr/lib/chromium/chromium'


def http_json(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('url'); ap.add_argument('out')
    ap.add_argument('--wait', default='READY')
    ap.add_argument('--timeout', type=float, default=90)
    ap.add_argument('--width', type=int, default=1440)
    ap.add_argument('--height', type=int, default=900)
    ap.add_argument('--port', type=int, default=9222)
    a = ap.parse_args()

    import websocket

    profile = f'/tmp/s3d546chrome/cdp{a.port}'
    os.makedirs(profile, exist_ok=True)
    env = dict(os.environ, TMPDIR='/tmp/s3d546chrome')
    proc = subprocess.Popen([
        CHROME, '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
        '--hide-scrollbars', f'--user-data-dir={profile}', f'--remote-debugging-port={a.port}',
        f'--window-size={a.width},{a.height}', 'about:blank',
    ], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = None
        deadline = time.time() + 30
        while time.time() < deadline and not ws_url:
            try:
                tabs = http_json(f'http://127.0.0.1:{a.port}/json/list')
                pages = [t for t in tabs if t.get('type') == 'page']
                if pages:
                    ws_url = pages[0]['webSocketDebuggerUrl']
            except Exception:
                time.sleep(0.3)
        if not ws_url:
            sys.exit('could not reach chromium devtools')

        ws = websocket.create_connection(ws_url, timeout=a.timeout, suppress_origin=True)
        mid = [0]
        logs = []

        def send(method, **params):
            mid[0] += 1
            ws.send(json.dumps({'id': mid[0], 'method': method, 'params': params}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get('method') in ('Runtime.consoleAPICalled', 'Log.entryAdded'):
                    logs.append(msg)
                    continue
                if msg.get('id') == mid[0]:
                    return msg.get('result', {})

        send('Page.enable'); send('Runtime.enable'); send('Log.enable')
        send('Emulation.setDeviceMetricsOverride', width=a.width, height=a.height,
             deviceScaleFactor=1, mobile=False)
        send('Page.navigate', url=a.url)

        title = ''
        end = time.time() + a.timeout
        while time.time() < end:
            try:
                r = send('Runtime.evaluate', expression='document.title', returnByValue=True)
                title = (r.get('result') or {}).get('value') or ''
            except Exception as e:
                title = f'(eval failed: {e})'
            if title.startswith(a.wait):
                break
            time.sleep(0.4)
        # one more paint after the scene is ready
        time.sleep(0.8)
        shot = send('Page.captureScreenshot', format='png', captureBeyondViewport=False)
        data = shot.get('data')
        if not data:
            sys.exit('capture returned no data')
        with open(a.out, 'wb') as f:
            f.write(base64.b64decode(data))
        print('TITLE:', title[:400])
        try:
            r = send('Runtime.evaluate', expression="(document.getElementById('log')||{}).textContent||''",
                     returnByValue=True)
            text = (r.get('result') or {}).get('value') or ''
            if text.strip():
                print('LOG:', text.strip()[:800])
        except Exception:
            pass
        for entry in logs:
            if entry.get('method') == 'Log.entryAdded':
                e = entry['params']['entry']
                if e.get('level') in ('error', 'warning'):
                    print('PAGE', e.get('level'), e.get('text', '')[:300])
        print('WROTE', a.out, os.path.getsize(a.out), 'bytes')
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == '__main__':
    main()
