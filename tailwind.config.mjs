/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{vue,js,ts,jsx,tsx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                "primary": "#13b6ec",
                "background-light": "#f6f8f8",
                "background-dark": "#101d22",
            },
            fontFamily: {
                "display": ["Space Grotesk", "sans-serif"]
            },
        },
    },
    plugins: [],
}
