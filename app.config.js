// app.config.js
module.exports = ({ config }) => {
    
    // ✅ SOLUCIÓN: Ponemos la llave directa para asegurar que EAS la lea sí o sí.
    // Al tener restricciones de SHA-1 en Google Cloud, esto es SEGURO.
    const GOOGLE_MAPS_API_KEY = "AIzaSyBEkn8qBfdkJkH-ZFW5yzOR-jrAxFdI-gA"; 

    return {
        "expo": {
            "name": "Noar ERP",
            "slug": "Distribuidora",
            "version": "1.0.0",
            "orientation": "portrait",
            "icon": "./assets/images/icon.png",
            "scheme": "movilappnueva",
            "userInterfaceStyle": "automatic",
            "newArchEnabled": true,
            "splash": {
                "image": "./assets/images/splash-icon.png",
                "resizeMode": "contain",
                "backgroundColor": "#ffffff",
                "dark": {
                    "backgroundColor": "#000000"
                }
            },
            "ios": {
                "supportsTablet": true,
                "bundleIdentifier": "com.dimondice.Distribuidora", 
                "config": {
                    "googleMaps": {
                        "apiKey": GOOGLE_MAPS_API_KEY
                    }
                }
            },
            "android": {
                "edgeToEdgeEnabled": true,
                "predictiveBackGestureEnabled": false,
                "package": "com.dimondice.Distribuidora",
                "googleServicesFile": "./google-services.json",
                "permissions": [
                    "android.permission.ACCESS_COARSE_LOCATION",
                    "android.permission.ACCESS_FINE_LOCATION"
                ],
                "adaptiveIcon": {
                    "foregroundImage": "./assets/images/adaptive-icon.png",
                    "backgroundColor": "#FFFFFF"
                },
                "config": {
                    "googleMaps": {
                        "apiKey": GOOGLE_MAPS_API_KEY // ✅ Aquí se inyectará la llave real
                    }
                },
                "compileSdkVersion": 36,
                "targetSdkVersion": 36,
                "buildToolsVersion": "34.0.0",
                "ndk": "26.1.10909125",
                "cmake": "3.22.1"
            },
            "web": {
                "output": "static",
                "favicon": "./assets/images/favicon.png"
            },
            "plugins": [
                [
                    "expo-splash-screen",
                    {
                        "image": "./assets/images/splash-icon.png",
                        "imageWidth": 200,
                        "resizeMode": "contain",
                        "backgroundColor": "#ffffff",
                        "dark": {
                            "backgroundColor": "#000000"
                        }
                    }
                ],
                "@react-native-firebase/app"
            ],
            "extra": {
                "eas": {
                    "projectId": "1d7623d1-bc88-47cc-b1f9-73b653ce4ae5" 
                }
            }
        }
    };
};