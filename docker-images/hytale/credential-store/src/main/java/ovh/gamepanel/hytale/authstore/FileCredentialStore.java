package ovh.gamepanel.hytale.authstore;

import com.hypixel.hytale.server.core.auth.IAuthCredentialStore;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

final class FileCredentialStore implements IAuthCredentialStore {
    private final Path path;
    private final Consumer<String> info;
    private final BiConsumer<String, Throwable> error;

    FileCredentialStore(Path path, Consumer<String> info, BiConsumer<String, Throwable> error) {
        this.path = path;
        this.info = info;
        this.error = error;
    }

    @Override
    public synchronized void setTokens(OAuthTokens tokens) {
        Credentials current = readCredentials();
        writeCredentials(new Credentials(
            tokens.accessToken(),
            tokens.refreshToken(),
            tokens.accessTokenExpiresAt(),
            current.profileUuid()
        ));
        info.accept("OAuth tokens updated.");
    }

    @Override
    public synchronized OAuthTokens getTokens() {
        Credentials credentials = readCredentials();
        return new OAuthTokens(
            credentials.accessToken(),
            credentials.refreshToken(),
            credentials.accessTokenExpiresAt()
        );
    }

    @Override
    public synchronized void setProfile(UUID uuid) {
        Credentials current = readCredentials();
        writeCredentials(new Credentials(
            current.accessToken(),
            current.refreshToken(),
            current.accessTokenExpiresAt(),
            uuid
        ));
        info.accept("OAuth profile updated.");
    }

    @Override
    public synchronized UUID getProfile() {
        return readCredentials().profileUuid();
    }

    @Override
    public synchronized void clear() {
        try {
            Files.deleteIfExists(path);
            info.accept("Credential store cleared.");
        } catch (IOException exception) {
            error.accept("Failed to clear credential store", exception);
        }
    }

    private Credentials readCredentials() {
        if (!Files.exists(path)) {
            return Credentials.empty();
        }

        try {
            return Credentials.fromJson(Files.readString(path));
        } catch (Exception exception) {
            error.accept("Failed to read credential store", exception);
            return Credentials.empty();
        }
    }

    private void writeCredentials(Credentials credentials) {
        try {
            Path parent = path.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }

            Path temp = path.resolveSibling(path.getFileName() + ".tmp");
            Files.writeString(temp, credentials.toJson());

            try {
                Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException ignored) {
                Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException exception) {
            error.accept("Failed to write credential store", exception);
        }
    }

    private record Credentials(
        String accessToken,
        String refreshToken,
        Instant accessTokenExpiresAt,
        UUID profileUuid
    ) {
        static Credentials empty() {
            return new Credentials(null, null, null, null);
        }

        static Credentials fromJson(String json) {
            String accessToken = firstString(json, "accessToken", "access_token");
            String refreshToken = firstString(json, "refreshToken", "refresh_token");
            String expiresAt = firstString(json, "accessTokenExpiresAt", "access_expires_at");
            String profile = firstString(json, "profileUuid", "profile_uuid", "uuid");

            return new Credentials(
                blankToNull(accessToken),
                blankToNull(refreshToken),
                parseInstant(expiresAt),
                parseUuid(profile)
            );
        }

        String toJson() {
            return "{\n"
                + "  \"accessToken\": " + jsonString(accessToken) + ",\n"
                + "  \"refreshToken\": " + jsonString(refreshToken) + ",\n"
                + "  \"accessTokenExpiresAt\": " + jsonString(accessTokenExpiresAt == null ? null : accessTokenExpiresAt.toString()) + ",\n"
                + "  \"profileUuid\": " + jsonString(profileUuid == null ? null : profileUuid.toString()) + "\n"
                + "}\n";
        }

        private static String firstString(String json, String... keys) {
            for (String key : keys) {
                String value = JsonStrings.readString(json, key);
                if (value != null) {
                    return value;
                }
            }
            return null;
        }

        private static String blankToNull(String value) {
            if (value == null) {
                return null;
            }
            String trimmed = value.trim();
            return trimmed.isEmpty() ? null : trimmed;
        }

        private static Instant parseInstant(String value) {
            String trimmed = blankToNull(value);
            return trimmed == null ? null : Instant.parse(trimmed);
        }

        private static UUID parseUuid(String value) {
            String trimmed = blankToNull(value);
            return trimmed == null ? null : UUID.fromString(trimmed);
        }

        private static String jsonString(String value) {
            return value == null ? "null" : "\"" + JsonStrings.escape(value) + "\"";
        }
    }
}
