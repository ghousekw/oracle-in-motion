import asyncio, base64, json, os, urllib.request
import edge_tts

OUT = 'samples'
os.makedirs(OUT, exist_ok=True)
texts = json.load(open('tools/voice/samples.json', encoding='utf-8'))


async def edge():
    voices = await edge_tts.list_voices()
    names = [v['ShortName'] for v in voices if v['Locale'] in ('hi-IN', 'en-IN')]
    print('available hi-IN / en-IN voices:', names)
    for voice in [n for n in names if n.startswith('hi-IN')]:
        for key, text in texts.items():
            path = f'{OUT}/edge_{voice}_{key}.mp3'
            await edge_tts.Communicate(text, voice).save(path)
            print('wrote', path)


def sarvam():
    key = os.environ.get('SARVAM_API_KEY')
    if not key:
        print('SARVAM_API_KEY not set, skipping Sarvam samples')
        return
    jobs = [(s, 'mixed') for s in ['shubh', 'aditya', 'rahul', 'kabir', 'priya', 'ritu', 'neha', 'simran']] + [('shubh', 'deva'), ('priya', 'deva')]
    for speaker, tkey in jobs:
        body = json.dumps({'text': texts[tkey], 'language_code': 'hi-IN', 'model': 'bulbul:v3',
                           'speaker': speaker, 'speech_sample_rate': 24000, 'output_audio_codec': 'mp3'}).encode()
        req = urllib.request.Request('https://api.sarvam.ai/text-to-speech', data=body, method='POST',
                                     headers={'api-subscription-key': key, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                audio = base64.b64decode(json.load(r)['audios'][0])
        except Exception as e:
            print('sarvam failed', speaker, tkey, getattr(e, 'read', lambda: b'')()[:300], e)
            continue
        path = f'{OUT}/sarvam_{speaker}_{tkey}.mp3'
        open(path, 'wb').write(audio)
        print('wrote', path)


asyncio.run(edge())
sarvam()
