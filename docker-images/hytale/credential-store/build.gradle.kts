plugins {
    java
}

group = "ovh.gamepanel"

val rawPluginVersion = (project.findProperty("pluginVersion") as? String)?.trim().orEmpty()
version = if (rawPluginVersion.matches(Regex("""\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?"""))) rawPluginVersion else "0.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(25)
    }
}

dependencies {
    compileOnly("com.hypixel.hytale:Server:+")
}

tasks.processResources {
    val pluginVersion = version.toString()
    inputs.property("pluginVersion", pluginVersion)
    filesMatching("manifest.json") {
        expand(mapOf("version" to pluginVersion))
    }
}

tasks.jar {
    archiveBaseName.set("gamepanel-hytale-credential-store")
    archiveVersion.set("")
}
