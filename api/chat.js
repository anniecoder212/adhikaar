module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY environment variable is not configured on the Vercel server.' });
    }

    const { details, language_code } = req.body || {};
    if (!details) {
        return res.status(400).json({ error: 'Missing details object in request body.' });
    }

    const langCode = language_code || 'hi-IN';

    // Construct request payload for Claude
    const userContent = `User spoken transcription: "${details.transcript || ''}"
Extracted Metadata (Verified):
- State Code: ${details.state || 'N/A'}
- Age: ${details.age || 'N/A'}
- Gender: ${details.gender || 'N/A'}
- Monthly Income (₹): ${details.income || '0'}
- Occupation: ${details.occupation || 'N/A'}

Identify which schemes the user qualifies for. Structure your response EXACTLY in this format for each eligible scheme:
### [Scheme Name]
[What the scheme gives them]
How to Apply: [How to register/apply]

Do not write anything else. Keep it warm, simple, and respond ONLY in the same language as the user spoke (Language code: ${langCode}). Remember, respond in maximum 4 sentences per scheme.`;

    const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                max_tokens: 3000,
                system: "You are Adhikaar, a government scheme eligibility assistant for rural Indians. Based on what the user tells you about themselves, identify which of these schemes they qualify for and explain simply what each scheme gives them and how to apply: PM Kisan, Ayushman Bharat, MNREGA, PM Awas Yojana, Sukanya Samriddhi Yojana, PM Ujjwala Yojana, PM Mudra Yojana, PM Fasal Bima Yojana, Atal Pension Yojana, PM Jan Dhan Yojana. Respond in maximum 4 sentences per scheme. Be warm and simple. Respond in the same language the user spoke in.",
                messages: [
                    { role: 'user', content: userContent }
                ]
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            return res.status(response.status).json({ error: errData.error?.message || `Claude API returned status ${response.status}` });
        }

        const data = await response.json();
        const responseText = data.content[0].text;

        // Parse schemes server-side to ensure robust card formatting
        const schemes = parseResponseToSchemes(responseText, langCode);

        return res.status(200).json({ responseText, schemes });
    } catch (err) {
        return res.status(500).json({ error: `Claude Integration error: ${err.message}` });
    }
};

// Server-side parsing of Claude response into structured cards
function parseResponseToSchemes(text, langCode) {
    const sections = text.split(/###\s+/);
    const schemes = [];

    for (const section of sections) {
        if (!section.trim()) continue;

        const lines = section.split('\n');
        const name = lines[0].trim();
        const content = lines.slice(1).join('\n').trim();

        let benefit = content;
        let apply = '';

        const applyMarkers = [
            'how to apply:',
            'आवेदन कैसे करें:',
            'விண்ணப்பிப்பது எப்படி:',
            'అప్లై చేయడం ఎలా:',
            'ಅನ್ವಯಿಸುವುದು ಹೇಗೆ:',
            'कसे अर्ज करावे:',
            'কিভাবে আবেদন করবেন:',
            'ਕਿਵੇਂ ਅਪਲਾਈ ਕਰਨਾ ਹੈ:',
            'അപേക്ഷിക്കേണ്ട വിധം:',
            'કેવી રીતે અરજી કરવી:'
        ];

        let markerIndex = -1;
        let foundMarkerLength = 0;
        
        for (const marker of applyMarkers) {
            const idx = content.toLowerCase().indexOf(marker);
            if (idx !== -1) {
                markerIndex = idx;
                foundMarkerLength = marker.length;
                break;
            }
        }

        if (markerIndex !== -1) {
            benefit = content.substring(0, markerIndex).trim();
            apply = content.substring(markerIndex + foundMarkerLength).trim();
        }

        schemes.push({
            name: name,
            benefit: benefit,
            apply: apply || 'Contact your local Gram Panchayat or Block Development Office for details.'
        });
    }

    return schemes;
}
