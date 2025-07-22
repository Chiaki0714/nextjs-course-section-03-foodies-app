import fs from 'node:fs';
import path from 'node:path';
import sql from 'better-sqlite3';
import slugify from 'slugify';
import xss from 'xss';
import { S3 } from '@aws-sdk/client-s3';

const db = sql('meals.db');
const s3 = new S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export async function getMeals() {
  // await new Promise(resolve => setTimeout(resolve, 2000));

  // throw new Error('Loading meals failed');
  return db.prepare('SELECT * FROM meals').all();
}

export function getMeal(slug) {
  return db.prepare('SELECT * FROM meals WHERE slug = ?').get(slug);
}

export async function saveMeal(meal) {
  meal.slug = slugify(meal.title, { lower: true }); //スラッグ化
  meal.instructions = xss(meal.instructions); // XSS対策
  if (!meal.image) {
    throw new Error('No image uploaded'); // 画像がなければエラー
  }

  // 画像拡張子と保存ファイル名
  const extension = meal.image.name.split('.').pop();
  const fileName = `${meal.slug}.${extension}`;
  const filePath = path.join('public', 'images', fileName);
  // const stream = fs.createWriteStream(`public/images/${fileName}`);

  // File -> Buffer 変換
  const bufferedImage = Buffer.from(await meal.image.arrayBuffer());
  // const bufferedImage = await meal.image.arrayBuffer();
  // stream.write(Buffer.from(bufferedImage), error => {
  //   if (error) {
  //     throw new Error('Saving image failed!');
  //   }
  // });

  // 画像ファイルを保存
  // await fs.promises.writeFile(filePath, bufferedImage);
  await s3.putObject({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: fileName,
    Body: Buffer.from(bufferedImage),
    ContentType: meal.image.type,
  });

  meal.image = fileName;

  db.prepare(
    `
    INSERT INTO meals
      (title, summary, instructions, creator, creator_email, image, slug)
    VALUES (
      @title,
      @summary,
      @instructions,
      @creator,
      @creator_email,
      @image,
      @slug
    )
  `
  ).run(meal);
}
