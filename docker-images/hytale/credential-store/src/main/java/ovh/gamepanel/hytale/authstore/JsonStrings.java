package ovh.gamepanel.hytale.authstore;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class JsonStrings {
    private JsonStrings() {
    }

    static String readString(String json, String key) {
        Pattern pattern = Pattern.compile(
            "\\\"" + Pattern.quote(key) + "\\\"\\s*:\\s*(null|\\\"((?:\\\\.|[^\\\\\\\"])*)\\\")"
        );
        Matcher matcher = pattern.matcher(json);
        if (!matcher.find()) {
            return null;
        }
        if ("null".equals(matcher.group(1))) {
            return null;
        }
        return unescape(matcher.group(2));
    }

    static String escape(String value) {
        StringBuilder builder = new StringBuilder(value.length() + 16);
        for (int index = 0; index < value.length(); index++) {
            char c = value.charAt(index);
            switch (c) {
                case '\\' -> builder.append("\\\\");
                case '"' -> builder.append("\\\"");
                case '\n' -> builder.append("\\n");
                case '\r' -> builder.append("\\r");
                case '\t' -> builder.append("\\t");
                default -> builder.append(c);
            }
        }
        return builder.toString();
    }

    private static String unescape(String value) {
        StringBuilder builder = new StringBuilder(value.length());
        boolean escaped = false;
        for (int index = 0; index < value.length(); index++) {
            char c = value.charAt(index);
            if (!escaped) {
                if (c == '\\') {
                    escaped = true;
                } else {
                    builder.append(c);
                }
                continue;
            }

            switch (c) {
                case '\\' -> builder.append('\\');
                case '"' -> builder.append('"');
                case 'n' -> builder.append('\n');
                case 'r' -> builder.append('\r');
                case 't' -> builder.append('\t');
                default -> builder.append(c);
            }
            escaped = false;
        }
        if (escaped) {
            builder.append('\\');
        }
        return builder.toString();
    }
}
