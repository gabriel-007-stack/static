import { createClient } from "@supabase/supabase-js";
import express from "express";

import x from 'dotenv';
import sharp from "sharp";
x.config();

const app = express();
const port = process.env.PORT || 3000;


const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function render() {
    return await supabase
    .storage
    .from('public/thumbnails')
    .download('404.png');
}


app.get('/favicon.ico', async (_, res) => { res.end() })
app.get('/ping', (_, res) => res.sendStatus(204));

app.get('/t/:id/:type', async (req, res) => {
    const { id, type } = req.params;

    const resolutions = {
        max: { width: 1920, height: 1080 },
        normal: { width: 720, height: 1280 },
        small: { width: 640, height: 480 },
        verysmall: { width: 320, height: 240 }
    };
    const type_ = /([\d]{3,4})x([\d]{3,4})/.test(type) || type.split("x")
    const size = resolutions[type] || { width: type_[0] && Math.min(type_[0], 2560) || 2560, height: type_[1] && Math.min(type_[1], 2560) || 1440 };

    try {
        const { data, error } = await supabase
            .storage
            .from('thumbnail')
            .download(id + '.png');

        if (error || !data) {
            const file = await render()

            const ff = new File([file.data], "");
            res.setHeader('content-length', file.data.size)
            res.setHeader('Content-Type', file.data.type)
            res.send(Buffer.from(await ff.arrayBuffer()))
            return;
        }

        const imageBuffer = data;
        let image = sharp(imageBuffer);

        // Resize image
        image = image.resize(size.width, size.height).png();
        const transformedImage = await image.toBuffer();
        res.setHeader('Content-Type', 'image/png');
        res.send(transformedImage);
    } catch (error) {
        res.end()
    }
})


app.get('*', async (req, res) => {
    const file = await render();
    if (file.error) {
        res.end()
    }
    const ff = new File([file.data], "");
    res.setHeader('content-length', file.data.size)
    res.setHeader('Content-Type', file.data.type)
    res.setHeader('Cache-Control', 'public, max-age=36000');
    res.send(Buffer.from(await ff.arrayBuffer()))
})

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));