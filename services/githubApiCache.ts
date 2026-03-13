// --- GitHub Rest API Extensions ---
export const createGithubRepo = async (token: string, name: string, description: string = ''): Promise<any> => {
    const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name,
            description,
            private: true, // Default to private for safety
            auto_init: true // Create an initial commit
        })
    });
    
    if (!response.ok) {
        throw new Error(`Failed to create repository: ${response.statusText}`);
    }
    
    return await response.json();
};

export const pushToGithub = async (token: string, owner: string, repo: string, files: { path: string, content: string, encoding?: string }[], commitMessage: string): Promise<any> => {
    const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    };

    // 1. Get the current commit object (usually from main branch)
    let refResponse = await fetch(`${baseUrl}/git/refs/heads/main`, { headers });
    
    // Fallback to master if main doesn't exist
    if (!refResponse.ok) {
        refResponse = await fetch(`${baseUrl}/git/refs/heads/master`, { headers });
        if (!refResponse.ok) {
             throw new Error("Could not find 'main' or 'master' branch.");
        }
    }
    const refData = await refResponse.json();
    const commitSha = refData.object.sha;
    const branchRef = refData.ref;

    // 2. Get the tree from the commit
    const commitResponse = await fetch(`${baseUrl}/git/commits/${commitSha}`, { headers });
    const commitData = await commitResponse.json();
    const treeSha = commitData.tree.sha;

    // 3. Create blob for each file and build a new tree
    const tree: any[] = [];
    for (const file of files) {
         // Create blob
         const blobResponse = await fetch(`${baseUrl}/git/blobs`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                 content: file.content,
                 encoding: file.encoding || 'utf-8'
            })
         });
         const blobData = await blobResponse.json();
         
         tree.push({
             path: file.path,
             mode: '100644', // File
             type: 'blob',
             sha: blobData.sha
         });
    }

    // 4. Create new tree
    const newTreeResponse = await fetch(`${baseUrl}/git/trees`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
             base_tree: treeSha,
             tree: tree
        })
    });
    const newTreeData = await newTreeResponse.json();

    // 5. Create new commit
    const newCommitResponse = await fetch(`${baseUrl}/git/commits`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
             message: commitMessage,
             tree: newTreeData.sha,
             parents: [commitSha]
        })
    });
    const newCommitData = await newCommitResponse.json();

    // 6. Update reference
    const updateRefResponse = await fetch(`${baseUrl}/git/${branchRef}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
             sha: newCommitData.sha
        })
    });
    
    return await updateRefResponse.json();
};
