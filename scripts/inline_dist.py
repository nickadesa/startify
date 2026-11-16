import re
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WEB_DIST_DIR = BASE_DIR / "web" / "dist"


def inline_dist_index() -> None:
    index_file = WEB_DIST_DIR / "index.html"
    if not index_file.exists():
        raise FileNotFoundError(f"Missing {index_file}")

    html = index_file.read_text(encoding="utf-8")

    def _replace_css(match: re.Match) -> str:
        href = match.group(1).lstrip("/")
        css_path = WEB_DIST_DIR / href
        if css_path.exists() and css_path.is_file():
            css_content = css_path.read_text(encoding="utf-8")
            return f"<style>{css_content}</style>"
        return match.group(0)

    html = re.sub(
        r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\'][^>]*/?>',
        _replace_css,
        html,
    )

    def _replace_js(match: re.Match) -> str:
        src = match.group(1).lstrip("/")
        js_path = WEB_DIST_DIR / src
        if js_path.exists() and js_path.is_file():
            js_content = js_path.read_text(encoding="utf-8")
            safe_js = js_content.replace("</script>", "<\\/script>")
            return f'<script type="module">{safe_js}</script>'
        return match.group(0)

    html = re.sub(
        r'<script[^>]+src=["\'](/assets/[^"\']+\.js)["\'][^>]*>\s*</script>',
        _replace_js,
        html,
    )

    index_file.write_text(html, encoding="utf-8")
    print(f"Inlined CSS & JS into {index_file} ({len(html):,} bytes)")


if __name__ == "__main__":
    inline_dist_index()
