import asyncio, json, os, edge_tts
OUT = 'samples'
os.makedirs(OUT, exist_ok=True)
texts = json.load(open('tools/voice/samples.json', encoding='utf-8'))

async def main():
    voices = await edge_tts.list_voices()
    names = [v['ShortName'] for v in voices if v['Locale'] in ('hi-IN', 'en-IN')]
    print('available hi-IN / en-IN voices:', names)
    for voice in [n for n in names if n.startswith('hi-IN')]:
        for key, text in texts.items():
            path = f'{OUT}/{voice}_{key}.mp3'
            await edge_tts.Communicate(text, voice).save(path)
            print('wrote', path)

asyncio.run(main())
