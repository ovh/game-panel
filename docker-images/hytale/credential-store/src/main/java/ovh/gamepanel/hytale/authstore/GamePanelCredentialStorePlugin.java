package ovh.gamepanel.hytale.authstore;

import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;

import java.util.concurrent.CompletableFuture;
import java.util.logging.Level;

public final class GamePanelCredentialStorePlugin extends JavaPlugin {
    public GamePanelCredentialStorePlugin(JavaPluginInit init) {
        super(init);
    }

    @Override
    public CompletableFuture<Void> preLoad() {
        GamePanelAuthCredentialStoreProvider.registerCodec(this::logInfo, this::logError);
        return CompletableFuture.completedFuture(null);
    }

    private void logInfo(String message) {
        getLogger().at(Level.INFO).log("[GamePanelCredentialStore] " + message);
    }

    private void logError(String message, Throwable error) {
        getLogger().at(Level.SEVERE).log("[GamePanelCredentialStore] "
            + message
            + ": "
            + error.getClass().getName()
            + ": "
            + error.getMessage());
    }
}
