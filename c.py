from pathlib import Path
from collections import defaultdict
import os


# ============================================================
# CẤU HÌNH
# ============================================================

CODE_EXTENSIONS = {
    # C / C++
    ".c", ".h", ".cc", ".hh", ".cpp", ".cxx", ".hpp", ".hxx", ".ipp", ".tpp",

    # Rust
    ".rs",

    # Python
    ".py", ".pyw", ".pyi",

    # JavaScript / TypeScript
    ".js", ".mjs", ".cjs", ".jsx",
    ".ts", ".mts", ".cts", ".tsx",

    # Java / JVM
    ".java", ".kt", ".kts", ".scala", ".groovy",

    # C#
    ".cs", ".csx",

    # Go
    ".go",

    # PHP
    ".php", ".php3", ".php4", ".php5", ".php7", ".php8", ".phtml",

    # Ruby
    ".rb", ".rake", ".gemspec",

    # Swift / Objective-C
    ".swift", ".m", ".mm",

    # Dart
    ".dart",

    # Lua
    ".lua",

    # Perl
    ".pl", ".pm",

    # R
    ".r",

    # Julia
    ".jl",

    # Haskell
    ".hs", ".lhs",

    # Elixir / Erlang
    ".ex", ".exs", ".erl", ".hrl",

    # Clojure
    ".clj", ".cljs", ".cljc",

    # F#
    ".fs", ".fsi", ".fsx",

    # Visual Basic
    ".vb",

    # Pascal / Delphi
    ".pas", ".pp",

    # Fortran
    ".f", ".f77", ".f90", ".f95", ".f03", ".f08",

    # Assembly
    ".asm", ".s", ".S",

    # Shell
    ".sh", ".bash", ".zsh", ".fish", ".csh", ".ksh",

    # PowerShell
    ".ps1", ".psm1", ".psd1",

    # Windows scripts
    ".bat", ".cmd",

    # Web
    ".html", ".htm", ".xhtml",
    ".css", ".scss", ".sass", ".less",

    # SQL
    ".sql",

    # Solidity
    ".sol",

    # Move
    ".move",

    # Verilog / SystemVerilog / VHDL
    ".v", ".vh", ".sv", ".svh", ".vhd", ".vhdl",

    # CUDA / OpenCL
    ".cu", ".cuh", ".cl",

    # Protobuf / GraphQL
    ".proto", ".graphql", ".gql",

    # Shader
    ".hlsl", ".fx", ".glsl", ".vert", ".frag", ".geom", ".comp",

    # Nix
    ".nix",

    # Zig
    ".zig",

    # Nim
    ".nim", ".nims",

    # Crystal
    ".cr",

    # OCaml
    ".ml", ".mli",

    # Lisp / Scheme
    ".lisp", ".lsp", ".el", ".scm",

    # CMake
    ".cmake",

    # GDScript
    ".gd",

    # QML
    ".qml",

    # Robot Framework
    ".robot",
}


# File code đặc biệt không có extension
SPECIAL_CODE_FILES = {
    "makefile",
    "gnumakefile",
    "cmakelists.txt",
    "dockerfile",
    "jenkinsfile",
    "rakefile",
    "gemfile",
    "vagrantfile",
}


# Thư mục bỏ qua hoàn toàn
IGNORE_DIRS = {
    # Version control
    ".git",
    ".svn",
    ".hg",
    ".bzr",

    # Node / JS
    "node_modules",
    ".next",
    ".nuxt",
    ".svelte-kit",
    ".angular",
    ".vite",
    ".parcel-cache",

    # Python
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".nox",
    ".venv",
    "venv",
    "env",
    ".env",

    # Rust
    "target",

    # Java / Gradle / Maven
    ".gradle",
    ".m2",

    # IDE
    ".idea",
    ".vscode",
    ".vs",

    # Build output
    "build",
    "builds",
    "dist",
    "out",
    "bin",
    "obj",
    "release",
    "debug",

    # Coverage
    "coverage",
    ".coverage",
    "htmlcov",

    # Cache / temp
    "cache",
    ".cache",
    "tmp",
    "temp",
    ".tmp",

    # Logs
    "logs",
    "log",

    # Dependencies
    "vendor",
    "packages",

    # Generated
    "generated",
    ".generated",
}


# File bỏ qua
IGNORE_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lock",
    "bun.lockb",
    "cargo.lock",
    "composer.lock",
    "gemfile.lock",
    "poetry.lock",
    "pipfile.lock",
}


CODE_EXTENSIONS_LOWER = {x.lower() for x in CODE_EXTENSIONS}
IGNORE_DIRS_LOWER = {x.lower() for x in IGNORE_DIRS}
IGNORE_FILES_LOWER = {x.lower() for x in IGNORE_FILES}
SPECIAL_CODE_FILES_LOWER = {x.lower() for x in SPECIAL_CODE_FILES}


# ============================================================
# XÁC ĐỊNH KIỂU COMMENT
# ============================================================

C_STYLE = {
    ".c", ".h", ".cc", ".hh", ".cpp", ".cxx", ".hpp", ".hxx",
    ".ipp", ".tpp",
    ".java",
    ".js", ".mjs", ".cjs", ".jsx",
    ".ts", ".mts", ".cts", ".tsx",
    ".cs", ".csx",
    ".go",
    ".rs",
    ".swift",
    ".m", ".mm",
    ".kt", ".kts",
    ".dart",
    ".scala",
    ".groovy",
    ".sol",
    ".cu", ".cuh",
    ".proto",
    ".hlsl", ".fx", ".glsl", ".vert", ".frag", ".geom", ".comp",
    ".qml",
    ".gd",
}


HASH_STYLE = {
    ".py", ".pyw", ".pyi",
    ".rb", ".rake", ".gemspec",
    ".sh", ".bash", ".zsh", ".fish", ".csh", ".ksh",
    ".r",
    ".pl", ".pm",
    ".nix",
}


SQL_STYLE = {
    ".sql",
}


LUA_STYLE = {
    ".lua",
}


LISP_STYLE = {
    ".lisp", ".lsp", ".el", ".scm",
    ".clj", ".cljs", ".cljc",
}


ASM_STYLE = {
    ".asm",
}


HTML_STYLE = {
    ".html", ".htm", ".xhtml",
}


CSS_STYLE = {
    ".css", ".scss", ".sass", ".less",
}


# ============================================================
# COMMENT PARSER
# ============================================================

def has_code_c_style(line: str, state: dict) -> bool:
    """
    Xử lý:
        // comment
        /* comment */
    Không coi # là comment nên #include / #define vẫn được tính.
    """

    i = 0
    n = len(line)

    in_block = state.get("block", False)
    quote = None

    found_code = False

    while i < n:
        if in_block:
            end = line.find("*/", i)

            if end == -1:
                state["block"] = True
                return found_code

            in_block = False
            state["block"] = False
            i = end + 2
            continue

        ch = line[i]

        # Trong string
        if quote:
            found_code = True

            if ch == "\\":
                i += 2
                continue

            if ch == quote:
                quote = None

            i += 1
            continue

        # String
        if ch in ("'", '"', "`"):
            quote = ch
            found_code = True
            i += 1
            continue

        # //
        if i + 1 < n and line[i:i + 2] == "//":
            break

        # /*
        if i + 1 < n and line[i:i + 2] == "/*":
            in_block = True
            state["block"] = True
            i += 2
            continue

        if not ch.isspace():
            found_code = True

        i += 1

    state["block"] = in_block
    return found_code


def has_code_hash_style(line: str, state: dict) -> bool:
    """
    Python, shell, ruby...
    Hỗ trợ # comment.
    Python triple quote cũng được xử lý cơ bản.
    """

    stripped = line.strip()

    if not stripped:
        return False

    triple = state.get("triple")

    if triple:
        pos = line.find(triple)

        if pos == -1:
            return False

        state["triple"] = None

        remaining = line[pos + 3:]
        return bool(remaining.strip())

    # Python multiline string / docstring
    for marker in ('"""', "'''"):
        pos = line.find(marker)

        if pos != -1:
            before = line[:pos].strip()

            second = line.find(marker, pos + 3)

            if second != -1:
                after = line[second + 3:].strip()
                return bool(before or after)

            state["triple"] = marker

            return bool(before)

    quote = None
    escaped = False

    for i, ch in enumerate(line):
        if escaped:
            escaped = False
            continue

        if ch == "\\":
            escaped = True
            continue

        if quote:
            if ch == quote:
                quote = None
            continue

        if ch in ("'", '"'):
            quote = ch
            continue

        if ch == "#":
            return bool(line[:i].strip())

    return bool(line.strip())


def has_code_sql(line: str, state: dict) -> bool:
    """
    SQL:
        -- comment
        /* comment */
    """

    i = 0
    n = len(line)

    in_block = state.get("block", False)
    quote = None
    found_code = False

    while i < n:
        if in_block:
            end = line.find("*/", i)

            if end == -1:
                return found_code

            state["block"] = False
            in_block = False
            i = end + 2
            continue

        ch = line[i]

        if quote:
            found_code = True

            if ch == quote:
                if i + 1 < n and line[i + 1] == quote:
                    i += 2
                    continue

                quote = None

            i += 1
            continue

        if ch in ("'", '"'):
            quote = ch
            found_code = True
            i += 1
            continue

        if line[i:i + 2] == "--":
            break

        if line[i:i + 2] == "/*":
            state["block"] = True
            in_block = True
            i += 2
            continue

        if not ch.isspace():
            found_code = True

        i += 1

    return found_code


def has_code_html(line: str, state: dict) -> bool:
    """
    HTML:
        <!-- comment -->
    """

    i = 0
    found_code = False
    in_block = state.get("block", False)

    while i < len(line):

        if in_block:
            end = line.find("-->", i)

            if end == -1:
                return found_code

            in_block = False
            state["block"] = False
            i = end + 3
            continue

        start = line.find("<!--", i)

        if start == -1:
            if line[i:].strip():
                found_code = True
            break

        if line[i:start].strip():
            found_code = True

        end = line.find("-->", start + 4)

        if end == -1:
            state["block"] = True
            break

        i = end + 3

    return found_code


def has_code_lua(line: str, state: dict) -> bool:
    """
    Lua:
        -- comment
        --[[ block ]]
    """

    stripped = line.strip()

    if not stripped:
        return False

    if state.get("block"):
        end = line.find("]]")

        if end == -1:
            return False

        state["block"] = False
        return bool(line[end + 2:].strip())

    block_start = line.find("--[[")

    if block_start != -1:
        before = line[:block_start].strip()

        block_end = line.find("]]", block_start + 4)

        if block_end == -1:
            state["block"] = True
            return bool(before)

        after = line[block_end + 2:].strip()
        return bool(before or after)

    pos = line.find("--")

    if pos != -1:
        return bool(line[:pos].strip())

    return True


def has_code_simple_semicolon(line: str, state: dict) -> bool:
    stripped = line.strip()

    if not stripped:
        return False

    return not stripped.startswith(";")


def has_code_default(line: str, state: dict) -> bool:
    return bool(line.strip())


# ============================================================
# ĐẾM FILE
# ============================================================

def count_code_lines(file: Path) -> int:
    ext = file.suffix.lower()

    state = {}

    count = 0

    try:
        with file.open(
            "r",
            encoding="utf-8",
            errors="ignore"
        ) as f:

            for line in f:

                if not line.strip():
                    continue

                if ext in C_STYLE:
                    is_code = has_code_c_style(line, state)

                elif ext in HASH_STYLE:
                    is_code = has_code_hash_style(line, state)

                elif ext in SQL_STYLE:
                    is_code = has_code_sql(line, state)

                elif ext in HTML_STYLE:
                    is_code = has_code_html(line, state)

                elif ext in CSS_STYLE:
                    is_code = has_code_c_style(line, state)

                elif ext in LUA_STYLE:
                    is_code = has_code_lua(line, state)

                elif ext in LISP_STYLE:
                    is_code = has_code_simple_semicolon(line, state)

                elif ext in ASM_STYLE:
                    is_code = has_code_simple_semicolon(line, state)

                else:
                    is_code = has_code_default(line, state)

                if is_code:
                    count += 1

    except (OSError, UnicodeError):
        return -1

    return count


# ============================================================
# MAIN
# ============================================================

def main():

    root = Path.cwd().resolve()

    stats = defaultdict(
        lambda: {
            "files": 0,
            "lines": 0
        }
    )

    total_files = 0
    total_lines = 0

    skipped_errors = 0

    # os.walk tốt hơn rglob ở đây vì có thể chặn node_modules
    # ngay trước khi Python đi vào thư mục đó.
    for current_dir, dirs, files in os.walk(root):

        # Xóa các thư mục cần ignore khỏi danh sách duyệt.
        # Như vậy node_modules/build/.git sẽ không bị scan luôn.
        dirs[:] = [
            d for d in dirs
            if d.lower() not in IGNORE_DIRS_LOWER
        ]

        current_path = Path(current_dir)

        for filename in files:

            filename_lower = filename.lower()

            if filename_lower in IGNORE_FILES_LOWER:
                continue

            file = current_path / filename

            ext = file.suffix.lower()

            is_normal_code = ext in CODE_EXTENSIONS_LOWER
            is_special_code = filename_lower in SPECIAL_CODE_FILES_LOWER

            if not is_normal_code and not is_special_code:
                continue

            code_lines = count_code_lines(file)

            if code_lines < 0:
                skipped_errors += 1
                print(f"[LỖI] Không đọc được: {file}")
                continue

            if code_lines == 0:
                continue

            total_files += 1
            total_lines += code_lines

            language_key = ext if ext else filename_lower

            if filename_lower == "cmakelists.txt":
                language_key = "cmake"

            elif filename_lower == "makefile":
                language_key = "makefile"

            elif filename_lower == "dockerfile":
                language_key = "dockerfile"

            stats[language_key]["files"] += 1
            stats[language_key]["lines"] += code_lines

    # ========================================================
    # OUTPUT
    # ========================================================

    print()
    print("=" * 72)
    print(f"Thư mục        : {root}")
    print(f"Tổng file code : {total_files:,}")
    print(f"Tổng dòng code : {total_lines:,}")

    if skipped_errors:
        print(f"File lỗi đọc    : {skipped_errors:,}")

    print("=" * 72)

    print(
        f"{'Loại':<15}"
        f"{'File':>12}"
        f"{'Dòng code':>20}"
        f"{'Tỷ lệ':>15}"
    )

    print("-" * 72)

    for ext, data in sorted(
        stats.items(),
        key=lambda x: x[1]["lines"],
        reverse=True
    ):

        percent = (
            data["lines"] / total_lines * 100
            if total_lines
            else 0
        )

        print(
            f"{ext:<15}"
            f"{data['files']:>12,}"
            f"{data['lines']:>20,}"
            f"{percent:>14.2f}%"
        )

    print("=" * 72)


if __name__ == "__main__":
    main()