import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presignUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

const s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Back-compat helpers for legacy v2-style usage (putObject/getObject/deleteObject/getSignedUrl).
s3.putObject = (params) => ({
    promise: () => s3.send(new PutObjectCommand(params)),
});
s3.getObject = (params) => ({
    promise: () => s3.send(new GetObjectCommand(params)),
});
s3.deleteObject = (params) => ({
    promise: () => s3.send(new DeleteObjectCommand(params)),
});
s3.getSignedUrl = async (operation, params) => {
    if (operation !== "getObject") {
        throw new Error(`Unsupported S3 presign operation: ${operation}`);
    }

    const expiresIn = Number(params?.Expires || 900);
    return presignUrl(s3, new GetObjectCommand(params), { expiresIn });
};

export default s3;