// popup.js
document.addEventListener('DOMContentLoaded', function() {
    const saveTabBtn = document.getElementById('saveTabBtn');
    const savedTabsList = document.getElementById('savedTabsList');
    const filterTagsInput = document.getElementById('filterTagsInput');
    const websiteTitleInput = document.getElementById('websiteTitle');
    const exportTabsBtn = document.getElementById('exportTabsBtn');
    const importTabsInput = document.getElementById('importTabsInput');
    const importTabsBtn = document.getElementById('importTabsBtn');

    // Compression utility functions
    function compressSavedTabs(savedTabs) {
        return savedTabs.map(tab => ({
            u: tab.url,  // Shortened keys
            t: tab.title,
            n: tab.notes,
            g: tab.tags,
            s: tab.savedAt
        }));
    }

    function decompressSavedTabs(compressedTabs) {
        return compressedTabs.map(tab => ({
            url: tab.u,
            title: tab.t,
            notes: tab.n,
            tags: tab.g,
            savedAt: tab.s
        }));
    }

    // Fetch website title when popup opens
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const currentTab = tabs[0];
        websiteTitleInput.value = currentTab.title;
    });

    // Save current tab
    saveTabBtn.addEventListener('click', function() {
        // Get current active tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentTab = tabs[0];
            const title = document.getElementById('websiteTitle').value || currentTab.title;
            const notes = document.getElementById('websiteNotes').value;
            const tags = document.getElementById('websiteTags').value.split(',')
                .map(tag => tag.trim().toLowerCase())
                .filter(tag => tag !== '');

            const savedTab = {
                url: currentTab.url,
                title: title,
                notes: notes,
                tags: tags,
                savedAt: new Date().toISOString()
            };

            // Save to chrome local storage
            chrome.storage.local.get(['savedTabs'], function(result) {
                let savedTabs = result.savedTabs || [];
                
                // Implement max limit and remove oldest tabs if needed
                if (savedTabs.length >= 200) {
                    savedTabs = savedTabs.slice(-200);
                }

                // Check for duplicate tabs (prevent saving same URL twice)
                const isDuplicate = savedTabs.some(tab => tab.url === savedTab.url);
                if (!isDuplicate) {
                    savedTabs.push(savedTab);
                }

                chrome.storage.local.set({savedTabs: savedTabs}, function() {
                    // Clear input fields
                    document.getElementById('websiteNotes').value = '';
                    document.getElementById('websiteTags').value = '';

                    // Refresh saved tabs list
                    loadSavedTabs();
                });
            });
        });
    });

    // Export saved tabs
    function exportSavedTabs() {
        chrome.storage.local.get(['savedTabs'], function(result) {
            const savedTabs = result.savedTabs || [];
            const dataStr = JSON.stringify(savedTabs, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
            
            const exportFileDefaultName = 'websaver_tabs_export.json';
            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        });
    }

    // Import saved tabs
    function importSavedTabs(event) {
        const fileReader = new FileReader();
        fileReader.onload = function(event) {
            try {
                const importedTabs = JSON.parse(event.target.result);
                
                chrome.storage.local.get(['savedTabs'], function(result) {
                    let savedTabs = result.savedTabs || [];
                    
                    // Merge and deduplicate
                    const mergedTabs = [...savedTabs, ...importedTabs]
                        .filter((tab, index, self) => 
                            index === self.findIndex((t) => t.url === tab.url)
                        )
                        // Limit to 200 most recent tabs
                        .slice(-200);
                    
                    chrome.storage.local.set({savedTabs: mergedTabs}, function() {
                        loadSavedTabs();
                    });
                });
            } catch (error) {
                console.error('Import failed:', error);
                alert('Failed to import tabs. Please check the file format.');
            }
        };
        
        const file = event.target.files[0];
        fileReader.readAsText(file);
    }

    // Load and filter saved tabs
    function loadSavedTabs() {
        chrome.storage.local.get(['savedTabs'], function(result) {
            const savedTabs = result.savedTabs || [];
            const filterTags = filterTagsInput.value.split(',')
                .map(tag => tag.trim().toLowerCase())
                .filter(tag => tag !== '');

            // Sort tabs by saved date (most recent first)
            const sortedTabs = [...savedTabs].sort((a, b) => 
                new Date(b.savedAt) - new Date(a.savedAt)
            );

            // Filter tabs based on search and tags
            const filteredTabs = sortedTabs.filter(tab => {
                const matchesTags = filterTags.length === 0 || 
                    filterTags.some(filterTag => 
                        tab.tags.some(tabTag => tabTag.includes(filterTag))
                    );
                
                return matchesTags;
            });

            // Clear previous list
            savedTabsList.innerHTML = '';

            // No results message
            if (filteredTabs.length === 0) {
                const noResultsMsg = document.createElement('p');
                noResultsMsg.textContent = 'No saved tabs found.';
                noResultsMsg.classList.add('no-results');
                savedTabsList.appendChild(noResultsMsg);
                return;
            }

            // Render filtered tabs
            filteredTabs.forEach((tab, index) => {
                const tabElement = document.createElement('div');
                tabElement.className = 'saved-tab';
                
                tabElement.innerHTML = `
                    <h3>${tab.title}</h3>
                    <p>URL: <a href="${tab.url}" target="_blank">${tab.url}</a></p>
                    ${tab.notes ? `<p class="tab-notes">Notes: ${tab.notes}</p>` : ''}
                    ${tab.tags.length > 0 ? `<p class="tab-tags">Tags: ${tab.tags.join(', ')}</p>` : ''}
                    <p class="tab-saved-date">Saved: ${new Date(tab.savedAt).toLocaleString()}</p>
                    <div class="tab-actions">
                        <button class="copy-url" data-url="${tab.url}">Copy URL</button>
                        <button class="delete-tab" data-url="${tab.url}">Delete</button>
                    </div>
                `;

                savedTabsList.appendChild(tabElement);
            });

            // Add event listeners for delete and copy buttons
            setupTabActions();
        });
    }

    // Setup actions for delete and copy buttons
    function setupTabActions() {
        // Delete tab functionality
        const deleteButtons = document.querySelectorAll('.delete-tab');
        deleteButtons.forEach(button => {
            button.addEventListener('click', function() {
                const url = this.getAttribute('data-url');
                
                chrome.storage.local.get(['savedTabs'], function(result) {
                    const savedTabs = result.savedTabs || [];
                    const updatedTabs = savedTabs.filter(tab => tab.url !== url);

                    chrome.storage.local.set({savedTabs: updatedTabs}, function() {
                        loadSavedTabs();
                    });
                });
            });
        });

        // Copy URL functionality
        const copyUrlButtons = document.querySelectorAll('.copy-url');
        copyUrlButtons.forEach(button => {
            button.addEventListener('click', function() {
                const url = this.getAttribute('data-url');
                navigator.clipboard.writeText(url).then(() => {
                    this.textContent = 'Copied!';
                    this.disabled = true;
                    setTimeout(() => {
                        this.textContent = 'Copy URL';
                        this.disabled = false;
                    }, 2000);
                });
            });
        });
    }

    // Add event listeners for search and filter
    filterTagsInput.addEventListener('input', loadSavedTabs);

    // Export and Import event listeners
    exportTabsBtn.addEventListener('click', exportSavedTabs);
    importTabsBtn.addEventListener('click', () => {
        importTabsInput.click();
    });
    importTabsInput.addEventListener('change', importSavedTabs);

    // Load saved tabs when popup opens
    loadSavedTabs();
});