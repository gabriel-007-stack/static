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
const static_url = "https://vqcmhpqxreafcjylrznn.supabase.co/storage/v1/object/public"

const resolutions = {
    max: { width: 1920, height: 1080 },
    maxreel: { width: 1080, height: 1920 },
    normal: { width: 720, height: 1280 },
    small: { width: 640, height: 360 },
    smallreel: { width: 360, height: 640 },
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


app.get('/favicon.ico', (_, res) => res.end());
app.get('/ping', (_, res) => res.sendStatus(204));
const typeUpload = ['VIDEO', 'PROFILE', 'BANNER']


app.get('/storyboard/:id/:type.jpg', async (req, res, next) => {
    const { id, type = "M3" } = req.params;
    const { sq, sig } = req.query;
    try {
        res.setHeader('Cache-Control', 'public, max-age=21600');
        let [prov, quality = 75] = atob(sq).split("|")


        quality = +quality
        quality = isNaN(quality) ? 75 : quality
        quality = Math.floor(quality) / 100

        const countThumbnails = Number(prov);


        let [_, indexStart, _type, gridCount] = type.match(/(\d{1,2})\_(M|I)(\d)/)
        const image = await loadImage(static_url + "/thumbnails/storyboard/" + id + ".jpg")
        if (_type == "M" && !isNaN(countThumbnails)) {

            gridCount = Math.max(1, +gridCount)
            gridCount = Math.min(4, gridCount)

            indexStart = +indexStart * (gridCount * gridCount)

            const aspact = image.naturalHeight / (image.naturalWidth / countThumbnails)
            const width = 120 / aspact;
            const canvas = createCanvas(width * gridCount, 120 * gridCount)
            const ctx = canvas.getContext('2d');
            for (let index = 0; index < gridCount; index++) {
                const ps = index % gridCount
                ctx.drawImage(image, (-indexStart - index * gridCount) * width, ps * 120)
            }
            const buffer = canvas.toBuffer("image/jpeg", { quality });
            res.set('Content-Type', 'image/jpeg');
            res.send(buffer);
        } else {
            next()
        }
    } catch (error) {
        console.log(error);

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
    res.setHeader('Cache-Control', 'public, max-age=7200');


    const cacheKey = `${id}-${width}x${height}.png`;
    if (imageCache.has(cacheKey)) {
        return res.send(imageCache.get(cacheKey));
    }

    try {
        res.setHeader('Content-Type', 'image/jpeg');
        const image = await loadImage(static_url + `/thumbnails/${id}.png`)
        const canvas = createCanvas(width, height)
        const ctx = canvas.getContext('2d');
        const aspact = image.naturalHeight / image.naturalWidth
        if (image.naturalHeight > image.naturalWidth) {
            ctx.drawImage(image, 0, -height / 2, width, height * aspact)
            ctx.fillStyle = "#000a"
            ctx.fillRect(0, 0, width, height)
        }
        const { left, top } = centralizaContain(image.naturalWidth, image.naturalHeight, width, height)
        ctx.drawImage(image, left, top, width - left * 2, height - top * 2)
        const buffer = canvas.toBuffer("image/jpeg");
        res.send(buffer);

    } catch (x) {
        res.status(500).end();
    }
});
//git add .;git commit -m "🎉 - 0.1.8";git push
// type = "BANNER" | "PROFILE"
// /u/:data => b64({id}|{type}|{quelity}|{size})
app.get('/u/:data', async (req, res) => {
    const { data: z } = req.params;
    try {
        res.setHeader('Cache-Control', 'public, max-age=86400, no-transform');
        const [id, type, local, size_scale = 1, size = 120] = atob(z).split("|")
        let { data, error } = await supabase.storage.from(`public/profile_image/${id}`).download("BANNER" === type ? `banner.png` : "profile.png");
        if ("BANNER" === type) {
            if (error) {
                res.status(403).end();
                return
            }
            const buffer = await blobToBufferAsync(data);

            res.setHeader('Content-Type', 'image/png');
            const width = 1920
            const height = 1080
            if (local === "TY") {
                res.send(buffer);
            } else if (local === "PC") {
                const left = 0
                const top = Math.floor(width * 0.21875);
                res.send(await sharp(buffer).extract({ left, top, width, height: height - top * 2 }).jpeg().toBuffer());
            } else {
                const left = Math.floor(width * 0.3);
                const top = Math.floor(width * 0.21875);
                res.send(await sharp(buffer).extract({ left, top, width, height: height - top * 2 }).jpeg().toBuffer());
            }
        } else {
            const size_ = +size
            if (isNaN(size_)) {
                return next()
            }
            res.setHeader('Content-Type', 'image/png');
            const buffer = await blobToBufferAsync(data);
            res.send(await sharp(buffer).resize({width:size_,height:size_}).jpeg().toBuffer());
        }
    } catch (a) {
        console.log(a)
        res.status(404).end();
    }
});

/**
 * upload private
 * type 'VIDEO' | 'PROFILE' | 'BANNER'
 * id \ videoId or channelId
 */

/**
 * upload private v6
 * type 'VIDEO' | 'PROFILE' | 'BANNER'
 * id \ videoId or channelId
 */
app.post('/upv6/:id/:type', async (req, res) => {
    let { id, type } = req.params;

    if (!(typeUpload.includes(type) && id.length > 4)) {
        res.status(403).send({ bed: true });
        return;
    }

    type = type.toUpperCase();
    let url = "";
    const key = {
        VIDEO: "thumbnails",
        PROFILE: "profile_image",
        BANNER: "profile_image"
    };
    url += id;
    if (key[type] === "profile_image") {
        url += "/";
        url += type === "BANNER" ? "banner" : "profile";
    }

    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", async () => {
        try {
            const buffer = Buffer.concat(chunks);

            const cleanBuffer = await removeMetadataFromImage(buffer);

            const { data, error } = await supabase.storage
                .from(key[type])
                .upload(url + ".png", cleanBuffer, {
                    cacheControl: '36000',
                    upsert: false,
                    metadata: { ch: id },
                    contentType: 'image/png'
                });

            if (error) {
                console.log(error);

                res.status(500).send({ error });
            } else {
                res.send(data);
            }
        } catch (error) {
            console.error('Erro durante o upload:', error);
            res.status(500).send({ error: error.message });
        }
    });
});

app.get('*', async (req, res) => {
    res.status(404)
    res.setHeader('Cache-Control', 'public, max-age=3600');
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

function centralizaContain(
    widthContent,
    heightContent,
    widthBox,
    heightBox
) {
    // Calcula a proporção do conteúdo em relação à caixa
    const scale = Math.min(widthBox / widthContent, heightBox / heightContent);

    // Calcula as dimensões redimensionadas do conteúdo
    const scaledWidth = widthContent * scale;
    const scaledHeight = heightContent * scale;

    // Centraliza o conteúdo na caixa
    const left = (widthBox - scaledWidth) / 2;
    const top = (heightBox - scaledHeight) / 2;

    return { left, top };
}
async function removeMetadataFromImage(buffer) {
    return await sharp(buffer)
        .withMetadata(false)
        .toBuffer();
}