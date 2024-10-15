import { createClient } from "@supabase/supabase-js";
import express from "express";
import dotenv from 'dotenv';
import fs from 'fs/promises';
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url"; import compression from "compression";
import { createCanvas, loadImage } from "canvas";
;
dotenv.config();
const imageCache = new Map();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3001;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const resolutions = {
    max: { width: 1920, height: 1080 },
    normal: { width: 720, height: 1280 },
    small: { width: 640, height: 360 },
    verysmall: { width: 320, height: 240 },
    default: { width: 168, height: 94 }
};

const imagePath404 = path.join(__dirname, '404.png');
async function render(res, cacheKey) {
    try {
        const data = await fs.readFile(imagePath404);
        res.setHeader('Content-Type', 'image/png');
        cacheKey && res.set(cacheKey, data);
        res.send(data);

    } catch {
        res.status(404).end();
    }
}

app.use(compression({
    level: 2,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

app.get('/favicon.ico', (_, res) => res.end());
app.get('/ping', (_, res) => res.sendStatus(204));



app.get('/storyboard/:id/:type.jpg', async (req, res, next) => {
    const { id, type = "M3" } = req.params;
    const { sq, sig } = req.query;
    try {
        let [prov, quality = 75] = atob(sq).split("|")
        

        quality = +quality
        quality = isNaN(quality) ? 75 : quality
        quality = Math.floor(quality) / 100

        const countThumbnails = Number(prov);


        let [_, indexStart, _type, gridCount] = type.match(/(\d{1,2})\_(M|I)(\d)/)
        if (_type == "M" && !isNaN(countThumbnails)) {

            gridCount = Math.max(1, +gridCount)
            gridCount = Math.min(4, gridCount)

            indexStart = +indexStart * (gridCount * gridCount)

            const image = await loadImage("https://vqcmhpqxreafcjylrznn.supabase.co/storage/v1/object/public/thumbnails/storyboard/n4nOHUPLkEyR.jpg")
            const aspact = image.naturalHeight / (image.naturalWidth / countThumbnails)
            const width = 120 / aspact;
            const canvas = createCanvas(width * gridCount, 120 * gridCount)
            const ctx = canvas.getContext('2d');
            for (let index = 0; index < gridCount; index++) {
                const ps = index % gridCount
                ctx.drawImage(image, (-indexStart - index * gridCount) * width, ps * 120)
            }
            const buffer = canvas.toBuffer("image/jpeg", { quality });
            res.set('Cache-Control', 'public, max-age=36000');
            res.set('Content-Type', 'image/jpeg');
            res.send(buffer);
        } else {

            next()
        }
    } catch (error) {
        next()
    }
});



app.get('/t/:id/:type.png', async (req, res) => {
    const { id, type } = req.params;
    const typeParts = /(\d{3,4})x(\d{3,4})/.exec(type);
    const { width, height } = resolutions[type] || {
        width: Math.min(typeParts?.[1] || 2560, 2560),
        height: Math.min(typeParts?.[2] || 2560, 2560)
    };

    const cacheKey = `${id}-${width}x${height}.png`;
    res.setHeader('Cache-Control', 'public, max-age=36000');
    if (imageCache.has(cacheKey)) {
        return res.send(imageCache.get(cacheKey));
    }

    try {
        res.setHeader('Content-Type', 'image/jpeg');
        let { data, error } = await supabase
            .storage
            .from('public/thumbnails')
            .download(`${id}.png`);

        if (error || !data) {
            await render(res);
            return;
        }
        const buff = await blobToBufferAsync(data)
        const buffer = await processImage(buff, width, height)
        res.status(200).send(buffer);
        res.set(cacheKey, buffer);
    } catch (x) {
        res.status(500).end();
    }
});
// type = "BANNER" | "PROFILE"
// /u/:token => {id}|{type}|..
app.get('/u/:token', async (req, res) => {
    const { token } = req.params;
    try {
        const [id, type, local, size_scale = 1] = atob(token).split("|")
        if ("BANNER" === type) {
            let { data, error } = await supabase.storage.from(`public/profile_image/${id}`).download(`banner.png`);
            if (error) {
                res.status(403).end();
                return
            }
            const buffer = await blobToBufferAsync(data);

            res.setHeader('Content-Type', 'image/png');
            const width = 1920
            const height = 1080
            if (local === "TY") {
                res.setHeader('Cache-Control', 'public, max-age=36000');
                res.send(buffer);
            } else if (local === "PC") {
                res.setHeader('Cache-Control', 'public, max-age=36000');
                const left = 0
                const top = Math.floor(width * 0.21875);
                res.send(await sharp(buffer).extract({ left, top, width, height: height - top * 2 }).jpeg().toBuffer());
            } else {
                const left = Math.floor(width * 0.3);
                const top = Math.floor(width * 0.21875);
                res.send(await sharp(buffer).extract({ left, top, width, height: height - top * 2 }).jpeg().toBuffer());
            }
        }

        res.status(200).end();
    } catch (a) {
        res.status(404).end();
    }
});

app.get('*', async (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=36000');
    await render(res);
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
const blobToBufferAsync = async (blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    return Buffer.from(arrayBuffer);
};


async function processImage(buff, width, height) {
    const resizedImage = await sharp(buff)
        .resize({ width, height, fastShrinkOnLoad: true, fit: "contain", kernel: "cubic" })
        .jpeg({ quality: Math.floor(ramdom(40, 40)), })
        .toBuffer()
    return resizedImage
}


const ramdom = (start = 0, le = 1) => {
    return start + Math.random() * le
}