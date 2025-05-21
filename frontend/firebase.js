import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDwTEjsEEwmR5iOplpz0sjMMJL03oxkNT0",
  authDomain: "cloudstore-706e7.firebaseapp.com",
  projectId: "cloudstore-706e7",
  storageBucket: "cloudstore-706e7.firebasestorage.app",
  messagingSenderId: "954608366371",
  appId: "1:954608366371:web:6eebbd2874f61686931296"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();