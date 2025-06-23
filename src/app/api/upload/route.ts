// ============================================
// File Purpose: API route to upload NDA files to AWS S3 using AWS SDK and return the file URL.
// Original Author: Uday Turakhia
// Last Updated By: Uday Turakhia
// Last Updated On: 06/23/2025
// ============================================

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";

const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

export async function POST(req: NextRequest) {
    try {
        const { file, fileName, fileType } = await req.json();

        if (!file || !fileName || !fileType) {
            console.error("Missing file data:", { file, fileName, fileType });
            return NextResponse.json({ error: "Missing file data." }, { status: 400 });
        }

        const buffer = Buffer.from(file, "base64");

        console.log("Uploading to bucket:", process.env.AWS_BUCKET_NAME);

        const params = {
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: fileName,
            Body: buffer,
            ContentType: fileType,
        };

        const command = new PutObjectCommand(params);
        await s3Client.send(command);

        const fileUrl = `https://${params.Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${params.Key}`;

        console.log("Upload successful:", fileUrl);

        return NextResponse.json({ url: fileUrl }, { status: 200 });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Failed to upload file." }, { status: 500 });
    }
}
