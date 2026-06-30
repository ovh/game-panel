pluginManagement {
    repositories {
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        mavenCentral()
        maven {
            name = "hytale"
            url = uri("https://maven.hytale.com/release")
        }
    }
}

rootProject.name = "gamepanel-hytale-credential-store"
