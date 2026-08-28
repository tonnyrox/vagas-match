# -*- coding: utf-8 -*-
import os, sys, time
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".config", "opencode", "opencode_global"))
import zen_core as zd
URL = "https://www.linkedin.com/jobs/view/4458015724/?eBP=CwEAAAGgSEW6AvjOwrRb1MEUNT9ApDyTj1WBH2EJtEaHoW0_9iS-0SnnDTXXYZ_zNLE8MnIylKHkjOSXasqwy8Aqo5wkbaoGkJVuTue8FpIb4Is_VBP3hQ2-ws3VLRJ137b6EC7AefVXY-M3jcWtaTrolG5RA1b4TDK2WtFSpZYntzq6F4_BZqTPsotQRM9WJn1r_qgqEecnhOOFwOfQeoBcNFCWNMUbT0rviYCuVcEJwIXypFpQ3oTkbLsWgc4v0a8iSLQ0ohxR5PxemVdQrrAAc-yVNQWCM1OWEv4DjG5j2RVBbeQOe5OvM2Sx9LdjVmJyBwrKP5XP-rH8C43gcu4GP4VZI-TtXNwAS1KQuf4quLybXpgVOdaO9em1uN6iNLQ4_pQTmoSVTyXPH-mgBzdxE3kZMgvrN6PPlTW1T2RRomDpm13G8Z8OAw0p9s_meAAIohE&trk=flagship3_search_srp_jobs&refId=8piSikA49xhAdliW7nP4GQ%3D%3D&trackingId=yOzxQam7RT2zD%2B3pHFTFnA%3D%3D"
ws, mid = zd.conectar()
zd.navegar(ws, mid, URL)
time.sleep(10)
def chk():
    return zd.avaliar(ws, mid, """
    (function(){
      var box=document.querySelector('p[data-testid=\"expandable-text-box\"]');
      var btn=document.querySelectorAll('button[data-testid=\"expandable-text-button\"]').length;
      return JSON.stringify({boxLen: box?box.innerText.trim().length:0, temBotao: btn, title:(document.title.split('|')[0]||'').trim().slice(0,40)});
    })();
    """)
print("ANTES:", chk())
print("CLICA:", zd.avaliar(ws, mid, """(function(){var b=document.querySelectorAll('button[data-testid=\"expandable-text-button\"]');for(var i=0;i<b.length;i++)b[i].click();return b.length+' clicados';})();"""))
time.sleep(4)
print("DEPOIS:", chk())
try:
    if sys.stdin.isatty(): input()
except (EOFError, KeyboardInterrupt): pass
zd.fechar()
