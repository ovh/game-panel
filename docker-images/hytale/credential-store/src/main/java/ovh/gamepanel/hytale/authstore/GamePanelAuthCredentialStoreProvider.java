package ovh.gamepanel.hytale.authstore;

import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;
import com.hypixel.hytale.codec.lookup.Priority;
import com.hypixel.hytale.server.core.auth.AuthCredentialStoreProvider;
import com.hypixel.hytale.server.core.auth.IAuthCredentialStore;

import java.nio.file.Path;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

public final class GamePanelAuthCredentialStoreProvider implements AuthCredentialStoreProvider {
    public static final String ID = "GamePanel";
    public static final String DEFAULT_PATH = "/data/.gamepanel/hytale-credential-store.json";

    public static final BuilderCodec<GamePanelAuthCredentialStoreProvider> CODEC =
        BuilderCodec
            .builder(GamePanelAuthCredentialStoreProvider.class, GamePanelAuthCredentialStoreProvider::new)
            .append(
                new KeyedCodec<>("Path", Codec.STRING),
                (provider, path) -> provider.path = path,
                provider -> provider.path
            )
            .add()
            .build();

    private static final AtomicBoolean REGISTERED = new AtomicBoolean(false);
    private static Consumer<String> info = (_message) -> {};
    private static BiConsumer<String, Throwable> error = (_message, _throwable) -> {};

    private String path = DEFAULT_PATH;

    public static void registerCodec(Consumer<String> infoLogger, BiConsumer<String, Throwable> errorLogger) {
        info = infoLogger;
        error = errorLogger;

        if (!REGISTERED.compareAndSet(false, true)) {
            return;
        }

        AuthCredentialStoreProvider.CODEC.register(
            Priority.NORMAL,
            ID,
            GamePanelAuthCredentialStoreProvider.class,
            CODEC
        );
        info.accept("Registered AuthCredentialStoreProvider codec with Type=" + ID);
    }

    @Override
    public IAuthCredentialStore createStore() {
        info.accept("Using credential store file: " + path);
        return new FileCredentialStore(Path.of(path), info, error);
    }

    @Override
    public String toString() {
        return "GamePanelAuthCredentialStoreProvider{path='" + path + "'}";
    }
}
