// app.config.js
// ✅ CORRECCIÓN DE ERROR EAS: Añadimos ios.bundleIdentifier.

module.exports = ({ config }) => {
    
    // 1. Obtenemos el valor de la variable de entorno de EAS.
    const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

    return {
        
        "expo": {
            
            "name": "Distribuidora",
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
                // ✅ CAMBIO CLAVE: Definimos el bundleIdentifier para pasar la validación de EAS
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
                        "apiKey": GOOGLE_MAPS_API_KEY
                    }
                },
                "compileSdkVersion": 36,
                "targetSdkVersion": 36,
                "buildToolsVersion": "34.0.0",
                "ndk": "26.1.10900962",
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
                    // ✅ ID CORREGIDO
                    "projectId": "1d7623d1-bc88-47cc-b1f9-73b653ce4ae5" 
                }
            }
        }
    };
};