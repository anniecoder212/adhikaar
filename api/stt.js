const Busboy = require('busboy');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const sarvamKey = process.env.SARVAM_API_KEY;
    if (!sarvamKey) {
        return res.status(500).json({ error: 'SARVAM_API_KEY environment variable is not configured on the Vercel server.' });
    }

    try {
        const busboy = Busboy({ headers: req.headers });
        let fileBuffer = null;
        let fileName = 'recording.webm';
        let mimeType = 'audio/webm';
        let languageCode = 'hi-IN';

        busboy.on('file', (name, file, info) => {
            const { filename, mimeType: fileMimeType } = info;
            fileName = filename || 'recording.webm';
            mimeType = fileMimeType || 'audio/webm';
            
            const chunks = [];
            file.on('data', (data) => {
                chunks.push(data);
            });
            file.on('end', () => {
                fileBuffer = Buffer.concat(chunks);
            });
        });

        busboy.on('field', (name, val) => {
            if (name === 'language_code') {
                languageCode = val;
            }
        });

        busboy.on('finish', async () => {
            if (!fileBuffer) {
                return res.status(400).json({ error: 'No audio file uploaded.' });
            }

            // Construct multipart/form-data body manually to keep serverless footprint tiny
            const boundary = '----WebKitFormBoundaryAdhikaarSTT' + Math.random().toString(36).substring(2);
            
            const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
            const langField = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n${languageCode}`;
            const modelField = `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nsaaras:v3`;
            const footer = `\r\n--${boundary}--\r\n`;

            const bodyBuffer = Buffer.concat([
                Buffer.from(fileHeader),
                fileBuffer,
                Buffer.from(langField),
                Buffer.from(modelField),
                Buffer.from(footer)
            ]);

            try {
                const sarvamResponse = await fetch('https://api.sarvam.ai/speech-to-text', {
                    method: 'POST',
                    headers: {
                        'api-subscription-key': sarvamKey,
                        'Content-Type': `multipart/form-data; boundary=${boundary}`
                    },
                    body: bodyBuffer
                });

                if (!sarvamResponse.ok) {
                    const errText = await sarvamResponse.text();
                    return res.status(sarvamResponse.status).json({ error: `Sarvam STT failed: ${errText}` });
                }

                const data = await sarvamResponse.json();
                return res.status(200).json({ transcript: data.transcript });
            } catch (err) {
                return res.status(500).json({ error: `Error forwarding request to Sarvam: ${err.message}` });
            }
        });

        req.pipe(busboy);
    } catch (err) {
        return res.status(500).json({ error: `Multipart parsing error: ${err.message}` });
    }
};

// Critical: Disable bodyParser in Vercel to allow raw stream parsing via busboy
module.exports.config = {
    api: {
        bodyParser: false,
    },
};
