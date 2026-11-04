const tabs=[...document.querySelectorAll("[data-mode]")];tabs.forEach(b=>b.addEventListener("click",()=>{tabs.forEach(x=>x.classList.toggle("active",x===b));["director","god","developer"].forEach(id=>document.getElementById(id).classList.toggle("hidden",id!==b.dataset.mode))}));const log=document.getElementById("chatlog"),input=document.getElementById("prompt");function prepare(text){const p=document.createElement("p");p.className="bubble";p.textContent="Demande préparée : "+text+". Le moteur IA n'est pas connecté ; rien n'a été envoyé ni exécuté.";log.append(p);input.value=""}document.getElementById("ask").addEventListener("submit",e=>{e.preventDefault();if(input.value.trim())prepare(input.value.trim())});document.querySelectorAll("[data-prompt]").forEach(b=>b.addEventListener("click",()=>prepare(b.dataset.prompt)));

// Offline shell: registration is optional and never blocks the interface.
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
      // The console remains usable online if offline caching is unavailable.
    });
  });
}
