import { createClient } from "@supabase/supabase-js";
import express from "express";
import dotenv from 'dotenv';
import fs from 'fs/promises';
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const imageCache = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const resolutions = {
    max: { width: 1920, height: 1080 },
    normal: { width: 720, height: 1280 },
    small: { width: 640, height: 480 },
    verysmall: { width: 320, height: 240 },
    default: { width: 168, height: 94 }
};

async function render(res, cacheKey) {
    const imagePath = path.join(__dirname, '404.png');
    try {
        const data = await fs.readFile(imagePath);
        res.setHeader('Content-Type', 'image/png');
        cacheKey && res.set(cacheKey, data);
        res.send(data);
        
    } catch {
        res.status(404).end();
    }
}

app.get('/favicon.ico', (_, res) => res.end());
app.get('/ping', (_, res) => res.sendStatus(204));

app.get('/t/:id/:type.png', async (req, res) => {
    const { id, type } = req.params;
    const typeParts = /(\d{3,4})x(\d{3,4})/.exec(type);
    const size = resolutions[type] || {
        width: Math.min(typeParts?.[1] || 2560, 2560),
        height: Math.min(typeParts?.[2] || 1440, 1440)
    };

    const cacheKey = `${id}-${size.width}x${size.height}.png`;

    res.setHeader('Cache-Control', 'public, max-age=36000');
    if (imageCache.has(cacheKey)) {
        return res.send(imageCache.get(cacheKey));
    }
    
    try {
        const downloadStart = Date.now();
        const { data, error } = await supabase
            .storage
            .from('thumbnail')
            .download(`${id}.png`);

        if (error || !data) {
            return render(res, cacheKey);
        }

        const resizeStart = Date.now();
        const imageBuffer = await sharp(data).resize(size.width, size.height).png().toBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);
        res.set(cacheKey, imageBuffer);
    } catch {
        res.status(500).end();
    }
});

app.get('*', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=36000');
    await render(res);
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
