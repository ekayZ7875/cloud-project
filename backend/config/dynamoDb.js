import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import dotenv from 'dotenv';

dotenv.config();

const client = new DynamoDBClient({
  region: process.env.DYNAMODB_AWS_REGION || process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const docClient = DynamoDBDocumentClient.from(client);

const withPromise = (promise) => {
  promise.promise = () => promise;
  return promise;
};

export const dynamoDb = {
  send: (...args) => docClient.send(...args),
  get: (params) => withPromise(docClient.send(new GetCommand(params))),
  put: (params) => withPromise(docClient.send(new PutCommand(params))),
  update: (params) => withPromise(docClient.send(new UpdateCommand(params))),
  delete: (params) => withPromise(docClient.send(new DeleteCommand(params))),
  query: (params) => withPromise(docClient.send(new QueryCommand(params))),
  scan: (params) => withPromise(docClient.send(new ScanCommand(params))),
};
