// Google Analytics loader
const script = document.createElement("script");
script.async = true;
script.src = "https://www.googletagmanager.com/gtag/js?id=G-5NEDWETTFW";
document.head.appendChild(script);

window.dataLayer = window.dataLayer || [];

function gtag(){
    dataLayer.push(arguments);
}

gtag("js", new Date());
gtag("config", "G-5NEDWETTFW");