pluginManagement {
    repositories {
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        maven {
            name = "hytale"
            url = uri("https://maven.hytale.com/release")
            content { includeGroup("com.hypixel.hytale") }
        }
        mavenCentral {
            content { excludeGroup("com.hypixel.hytale") }
        }
    }
}

rootProject.name = "gamepanel-hytale-credential-store"
