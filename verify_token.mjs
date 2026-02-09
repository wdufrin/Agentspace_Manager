import { Octokit } from '@octokit/rest';

const token = process.env.GITHUB_TOKEN;
const octokit = new Octokit({ auth: token });

async function check() {
  try {
    const { data } = await octokit.users.getAuthenticated();
    console.log('Success:', data.login);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

check();
