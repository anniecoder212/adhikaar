module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const sarvamKey = process.env.SARVAM_API_KEY;
    if (!sarvamKey) {
        return res.status(500).json({ error: 'SARVAM_API_KEY environment variable is not configured on the Vercel server.' });
    }

    const { text, language_code } = req.body || {};
    if (!text) {
        return res.status(400).json({ error: 'Missing text in request body.' });
    }

    const langCode = language_code || 'hi-IN';

    try {
        const response = await fetch('https://api.sarvam.ai/text-to-speech', {
            method: 'POST',
            headers: {
                'api-subscription-key': sarvamKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                model: 'bulbul:v3',
                target_language_code: langCode,
                output_audio_codec: 'mp3'
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: `Sarvam TTS failed: ${errText}` });
        }

        const data = await response.json();
        if (data.audios && data.audios.length > 0) {
            return res.status(200).json({ audioContent: data.audios[0] });
        } else {
            return res.status(500).json({ error: 'No audio content returned from Sarvam TTS.' });
        }
    } catch (err) {
        return res.status(500).json({ error: `TTS Integration error: ${err.message}` });
    }
};
