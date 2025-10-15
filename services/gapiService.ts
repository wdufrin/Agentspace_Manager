// This service manages the loading and initialization of the Google API Client (gapi).

declare global {
  interface Window {
    gapi: any;
  }
}

// Singleton promise to ensure gapi is initialized only once.
let gapiClientPromise: Promise<void> | null = null;
let isGapiLoaded = false;

// List of all Google Cloud APIs the application needs to discover.
const DISCOVERY_DOCS = [
    'https://discoveryengine.googleapis.com/$discovery/rest?version=v1alpha',
    'https://discoveryengine.googleapis.com/$discovery/rest?version=v1beta',
    'https://aiplatform.googleapis.com/$discovery/rest?version=v1beta1',
    'https://cloudresourcemanager.googleapis.com/$discovery/rest?version=v1',
    'https://logging.googleapis.com/$discovery/rest?version=v2',
    'https://run.googleapis.com/$discovery/rest?version=v2',
    'https://www.googleapis.com/discovery/v1/apis/storage/v1/rest',
    'https://serviceusage.googleapis.com/$discovery/rest?version=v1',
];

/**
 * Loads the gapi script from Google's CDN.
 * Ensures the script is only added to the page once.
 */
const loadGapiScript = (): Promise<void> => {
    return new Promise((resolve) => {
        if (isGapiLoaded) {
            return resolve();
        }
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
            isGapiLoaded = true;
            resolve();
        };
        document.body.appendChild(script);
    });
};

/**
 * Initializes the Google API client. This function should be called once
 * when the application receives a valid access token. It's idempotent and
 * will only run the full initialization once. Subsequent calls with a new
 * token will just update the token.
 * @param accessToken The user's GCP access token.
 */
export const initGapiClient = (accessToken: string): Promise<void> => {
    if (!gapiClientPromise) {
        gapiClientPromise = new Promise(async (resolve, reject) => {
            try {
                await loadGapiScript();
                window.gapi.load('client', async () => {
                    try {
                        await window.gapi.client.init({
                            discoveryDocs: DISCOVERY_DOCS,
                        });
                        window.gapi.client.setToken({ access_token: accessToken });
                        resolve();
                    } catch (err) {
                        console.error('Error initializing gapi client:', err);
                        gapiClientPromise = null; // Reset on failure to allow retry
                        reject(err);
                    }
                });
            } catch (err) {
                console.error('Error loading gapi script:', err);
                gapiClientPromise = null; // Reset on failure
                reject(err);
            }
        });
    } else {
        // If already initialized or initializing, wait for it to finish then set the new token.
        return gapiClientPromise.then(() => {
             window.gapi.client.setToken({ access_token: accessToken });
        });
    }
    return gapiClientPromise;
};

/**
 * Returns a promise that resolves with the initialized gapi client object.
 * Throws an error if the client has not been initialized.
 */
export const getGapiClient = async (): Promise<any> => {
    if (!gapiClientPromise) {
        throw new Error('GAPI client has not been initialized. Call initGapiClient first.');
    }
    await gapiClientPromise;
    return window.gapi.client;
};
