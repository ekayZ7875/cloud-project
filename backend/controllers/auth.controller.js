import { dynamoDB } from "../config/dynamoDB/index.js";
import jwt from "jsonwebtoken";
import { errorHandler } from "../utils/errorHandler.js";

const USER_TABLE = process.env.USER_TABLE;

export const firebaseAuth = async (req, res) => {
  const { uid, email, fullname, lastname, avatar } = req.body;

  if (!uid || !email || !fullname) {
    return res
      .status(400)
      .send(errorHandler(400, "Missing Fields", "Required fields missing"));
  }

  try {
    const existingUser = await dynamoDB
      .get({
        TableName: USER_TABLE,
        Key: { email },
      })
      .promise();

    let user;

    if (existingUser.Item) {
      user = existingUser.Item;
    } else {
      user = {
        userId: uid,
        email,
        fullname,
        lastname: lastname || "",
        avatar: avatar || "",
        totalFileSize: 0,
        fileSizeAllowed: 1073741824, // 1GB
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await dynamoDB
        .put({
          TableName: USER_TABLE,
          Item: user,
        })
        .promise();
    }

    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(200).send({
      response: {
        token,
        user: {
          userId: user.userId,
          email: user.email,
          fullname: user.fullname,
          lastname: user.lastname,
          avatar: user.avatar,
        },
        message: "Login successful",
        status: 200,
      },
    });
  } catch (err) {
    console.error("Firebase Auth Error:", err);
    return res
      .status(500)
      .send(errorHandler(500, "Auth Failed", "Firebase login failed"));
  }
};
