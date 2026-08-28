# -*- coding: utf-8 -*-
"""abrir_navegador.py — launcher do projeto (extensao_trabalho_google).

Abre o Chrome ESPECIFICO do zendriver (perfil global com a extensao ja carregada)
e navega para a URL desejada. Usa o zen_core (zendriver, SEM servidor/porta fixa).

USO:
    python abrir_navegador.py                       # abre LinkedIn Jobs (teste da extensao)
    python abrir_navegador.py https://br.indeed.com # abre URL especifica
    python abrir_navegador.py --check               # so verifica o perfil/extensao
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".config", "opencode", "opencode_global"))
import zen_core as zd

PROJETO = os.path.dirname(os.path.abspath(__file__))
EXT_DIR = PROJETO  # a extensao esta nesta pasta (manifest.json na raiz)
DEFAULT_URL = "https://www.linkedin.com/jobs/search/?currentJobId=4457165494&f_TPR=r604800&keywords=assistente%20comercial&location=Goi%C3%A2nia%2C%20GO"


def main():
    args = sys.argv[1:]

    if "--check" in args:
        perfil = zd.DEFAULT_PROFILE
        ok = os.path.isdir(perfil)
        p1 = os.path.isdir(os.path.join(perfil, "Profile 1"))
        ext = os.path.isfile(os.path.join(EXT_DIR, "manifest.json"))
        print("Perfil zendriver :", perfil, "OK" if ok else "AUSENTE")
        print("Profile 1 logado :", "OK" if p1 else "ausente")
        print("Extensao nesta pasta:", "OK" if ext else "AUSENTE (manifest.json)")
        return 0

    url = args[0] if args else DEFAULT_URL
    if "://" not in url:
        url = "https://" + url

    print("Abrindo Chrome especifico (zendriver, perfil global + Profile 1)...")
    print("Usando extensao ja carregada no perfil.")

    ws, mid = zd.conectar()
    zd.navegar(ws, mid, url)
    print("Pagina aberta:", zd.achar_page()["url"])
    try:
        if sys.stdin.isatty():
            input("Pressione Enter para fechar o navegador...")
        else:
            import time
            while True:
                time.sleep(3600)
    except (KeyboardInterrupt, EOFError):
        pass
    zd.fechar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
