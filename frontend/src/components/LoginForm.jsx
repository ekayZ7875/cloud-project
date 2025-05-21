import React from 'react';
import { useNavigate } from "react-router-dom";
import { signInWithPopup } from "firebase/auth";
import { auth, provider } from "../../firebase";
import { Box } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { loginUser, signUp } from '../store/slice/userSlice';

export const LoginForm = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleGoogleSignIn = async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const googleUserData = {
                email: user.email,
                uid: user.uid,
            };
            await dispatch(loginUser(googleUserData));
            navigate('/');
        } catch (error) {
            console.error('Google Sign-In error:', error);
        }
    };

    const handleGoogleSignUp = async () => {
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const googleUserData = {
                email: user.email,
                uid: user.uid,
                name: user.displayName,
                avatar: user.photoURL,
            };
            await dispatch(signUp(googleUserData));
            navigate('/');
        } catch (error) {
            console.error('Google Sign-In error:', error);
        }
    }

    return (
        <>
            <div className="fixed inset-0 min-h-screen flex items-center justify-center overflow-hidden">
                {/* Background Image */}
                <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: "url('/blacks.jpeg')" }}
                ></div>

                {/* Login Component */}
                <div className="relative z-20 w-3/5 h-4/5 bg-black flex items-center justify-center rounded-lg shadow-lg">
                    <div className="w-full flex flex-col justify-center items-center text-white space-y-8">
                        {/* Heading */}
                        <div className="text-center flex flex-col w-full ">
                            <div className='flex flex-row justify-center items-center gap-2'>
                                {/* <img src="./google-logo.webp" alt="logo" className='h-5 w-5' /> */}
                                {/* <Box
                                    size={36}
                                    style={{
                                        animation: 'swing 2s ease-in-out infinite',
                                        transformOrigin: 'center bottom',
                                    }}
                                /> */}
                                <Box
                                    size={36}
                                   className='animate-pulse hover:animate-spin delay-200'
                                />
                                <h2 className="text-xl font-bold mb-2 ">Packd</h2>
                            </div>
                            <h2 className="text-gray-400 text-5xl font-bold mt-3 ">Sign in to your account</h2>
                        </div>

                        {/* Google Sign-In Button */}
                        {/* <button
                            onClick={handleGoogleSignIn}
                            className="px-4 flex items-center justify-center gap-3 py-3 rounded-3xl text-white font-medium hover:bg-gray-100 hover:text-black transition duration-200 shadow-md border-t-2 border-white"
                        >
                            <img
                                src="./google-logo.webp"
                                alt="Google logo"
                                className="w-5 h-5 object-contain"
                            />
                            Continue with Google
                        </button> */}
                        <button
                            onClick={handleGoogleSignIn}
                            className="border-expand-loop px-4 flex items-center justify-center gap-3 py-3 rounded-3xl text-white font-medium hover:bg-gray-100 hover:text-black transition duration-200 shadow-md relative"
                        >
                            <span className="right-border absolute right-0 bottom-0 w-[2px] bg-gray-300 rounded-r-3xl animate-side-border-grow pointer-events-none" />
                            <img
                                src="./google-logo.webp"
                                alt="Google logo"
                                className="w-5 h-5 object-contain"
                            />
                            Continue with Google
                        </button>

                        {/* Divider */}
                        <div className="flex items-center gap-2 text-gray-500 text-sm w-1/2">
                            <div className="h-px flex-1 bg-gray-700"></div>
                            OR
                            <div className="h-px flex-1 bg-gray-700"></div>
                        </div>

                        {/* Sign-Up Prompt */}
                        <div className="text-center text-sm text-gray-400">
                            Don’t have an account?
                            <button
                                onClick={handleGoogleSignUp}
                                className="ml-2 font-medium text-white underline hover:text-gray-300 transition"
                            >
                                Sign up
                            </button>
                        </div>
                    </div>
                </div>
            </div >
        </>
    );
};
