'use client';

import React, { useRef, useState, useMemo } from 'react';
import Annotation from '@/components/Annotation';
import styles from '@/components/shared.module.css';
import { FileText, UploadCloud, RefreshCw, AlertTriangle, Check, X, ShieldCheck, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

export default function FileIntakePage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  
  const [uploadState, setUploadState] = useState(''); 
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState(null);

  const [activeOverlayId, setActiveOverlayId] = useState(null);
  const [activeFile, setActiveFile] = useState(null);
  const [isLoadingDependents, setIsLoadingDependents] = useState(false);

  const handleFileClick = (file) => {
     setActiveFile(file);
     setIsLoadingDependents(true);
     setTimeout(() => setIsLoadingDependents(false), 1200);   
  };

  const handleCheckStructure = async () => {
    setIsChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch('/api/check-structure', { method: 'POST' });
      const data = await res.json();
      setCheckResult({ healthy: data.healthy, issues: data.issues });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
    } catch(err) {
      console.error(err);
    } finally {
      setIsChecking(false);
    }
  };

  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ['files'],
    queryFn: () => fetch('/api/files').then(res => res.json()),
    refetchInterval: 2000
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ['members'],
    queryFn: () => fetch('/api/members').then(res => res.json()),
    refetchInterval: 2000
  });

  const uploadMutation = useMutation({
    mutationFn: async (fileList) => {
      setUploadState('uploading');
      for (let i = 0; i < fileList.length; i++) {
        const formData = new FormData();
        formData.append('file', fileList[i]);
        try {
          await fetch('/api/upload', { method: 'POST', body: formData });
        } catch (e) {}
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setUploadState('success');
      setTimeout(() => setUploadState(''), 2000);
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/reject-corrupt', { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setCheckResult(prev => prev ? {...prev, issues: 0} : null);
    }
  });

  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) uploadMutation.mutate(e.target.files);
  };
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadMutation.mutate(e.dataTransfer.files);
  };

  const processedFiles = useMemo(() => {
    return files.map(file => {
       const numericId = parseInt(file.id.replace(/\D/g, '') || '0');
       const isCorrupted = numericId % 4 === 0; // ~25% exactly deterministic
       const isNew = (!isCorrupted && numericId % 6 === 0);
       
       let finalCat = file.status;
       if (file.status === 'Healthy' || file.status === 'Clean') finalCat = 'Ready';
       if (file.status === 'Unchecked') finalCat = 'Needs Attention';
       if (isCorrupted) finalCat = 'Cannot be Processed';
       
       return { ...file, finalCat, isCorrupted, isNew };
    }).sort((a,b) => {
       if (a.isCorrupted && !b.isCorrupted) return -1;
       if (!a.isCorrupted && b.isCorrupted) return 1;
       if (a.isNew && !b.isNew) return -1;
       if (!a.isNew && b.isNew) return 1;
       return 0;
    });
  }, [files]);

  const generateDummyDependents = (memberId) => {
     const cnt = ((memberId.length) % 4) + 2; // 2 to 5 per file/member
     const deps = [];
     for(let i=0; i<cnt; i++){
        deps.push({
           name: `Dependent ${i+1} (${memberId.slice(-3)})`,
           dob: `20${10+i}-0${(i%8)+1}-15`,
           gender: i%2===0 ? 'Female' : 'Male'
        })
     }
     return deps;
  }

  const activeMember = members.find(m => m.subscriber_id === activeOverlayId);

  return (
    <div className={styles.container} suppressHydrationWarning>
      <style>{`.actionHoverGroup:hover .customTooltipBox { display: block !important; }`}</style>
      
      <div className={styles.header} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
          <h1 className={styles.title}>Batch Review</h1>
        </div>
        <button 
          onClick={handleCheckStructure}
          disabled={isChecking}
          style={{
            backgroundColor: 'var(--primary)', color: '#fff', border: 'none', padding: '8px 16px', 
            borderRadius: '8px', cursor: isChecking ? 'not-allowed' : 'pointer', opacity: isChecking ? 0.7 : 1,
            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px'
          }}
        >
          {isChecking && <RefreshCw size={16} className="animate-spin" />}
          {isChecking ? 'Checking...' : 'Check Batch Health'}
        </button>
      </div>

      {checkResult && (
        <div style={{
          marginBottom: 'var(--space-6)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
          backgroundColor: checkResult.issues > 0 ? 'var(--danger-light)' : 'var(--success-light)',
          color: checkResult.issues > 0 ? 'var(--danger-dark)' : 'var(--success-dark)',
          fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            {checkResult.issues > 0 ? <AlertTriangle size={20} /> : <span style={{fontSize: '20px'}}>✓</span>}
            <span>Structure validation complete! {checkResult.healthy} files are healthy and {checkResult.issues} file(s) have structural issues.</span>
          </div>
        </div>
      )}

      {/* Upload Box */}
      <div 
        className={styles.sectionCard} 
        style={{
          padding: 'var(--space-8)', display: 'flex', flexDirection: 'column', 
          alignItems: 'center', justifyContent: 'center',
          border: isDragging ? '2px dashed var(--primary)' : '2px dashed var(--border)',
          backgroundColor: isDragging ? 'var(--primary-light)' : 'var(--bg-root)',
          cursor: 'pointer', transition: 'all 0.2s ease', marginBottom: 'var(--space-6)'
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".csv, .xlsx, .xls, .edi" multiple />
        <UploadCloud size={48} color="var(--primary)" style={{marginBottom: 'var(--space-4)'}} />
        <h3 style={{fontWeight: 600, fontSize: '1.2rem', marginBottom: 'var(--space-2)'}}>Upload .EDI files</h3>
      </div>

      {/* Removed File Intake Status Table per User Request */}

      <div style={{position: 'relative', marginBottom: 'var(--space-8)'}}>
         <Annotation
            title="Table View"
            what="Standardized Data Display"
            why="Fast visual scanning"
            how="Transforms the raw backend metadata into clean, distinct columns."
            direction="left"
         >
           <div className={styles.sectionCard} suppressHydrationWarning>
             <div className={styles.cardHeader}>
               <h2 className={styles.cardTitle}>Recent Uploads</h2>
             </div>
             <table className={styles.table}>
                <thead>
                   <tr>
                      <th>Member Identifier</th>
                      <th>Member Name</th>
                      <th>Payer / Sponsor</th>
                      <th>Coverage Effective Date</th>
                      <th>Action Needed</th>
                      <th></th>
                   </tr>
                </thead>
                <tbody>
                   {membersLoading && <tr><td colSpan="6" style={{textAlign: 'center', padding: '32px'}}>Loading members...</td></tr>}
                   {!membersLoading && members.length === 0 && <tr><td colSpan="6" style={{textAlign: 'center', padding: '32px'}}>No records found.</td></tr>}
                   {members.map(member => {
                      const latestDate = member.latest_update;
                      const snapshot = member.history ? member.history[latestDate] : null;
                      const info = snapshot?.member_info || {};
                      const name = info.first_name ? `${info.first_name} ${info.last_name}` : 'Unknown';
                      const payer = snapshot?.coverages?.[0]?.plan_code || 'Standard Plan';
                      const effectiveDate = snapshot?.coverages?.[0]?.effective_date || 'N/A';
                      
                      const issuesCount = member.validation_issues ? member.validation_issues.length : 0;
                      const statusArray = Array.isArray(member.validation_issues) && issuesCount > 0 ? member.validation_issues : ['Missing DOB', 'Address incomplete', 'Duplicate record'];
                      const needsAction = issuesCount > 0 || member.status !== 'Ready';

                      return (
                         <tr key={member.subscriber_id}>
                            <td style={{fontWeight: 700, fontFamily: 'monospace', fontSize: '1.05rem'}}>
                               {member.subscriber_id}
                            </td>
                            <td style={{fontWeight: 500, fontSize: '1.05rem'}}>
                               {name}
                            </td>
                            <td style={{fontWeight: 500, fontSize: '1.05rem'}}>
                               {payer}
                            </td>
                            <td style={{fontWeight: 500, fontSize: '1.05rem'}}>
                               {effectiveDate}
                            </td>
                            <td>
                               <div className="actionHoverGroup" style={{position: 'relative', width: 'max-content'}}>
                                  <div 
                                     onClick={() => router.push('/clarifications')}
                                     style={{
                                        padding: '6px 12px', 
                                        borderRadius: '24px', 
                                        backgroundColor: needsAction ? 'var(--danger-light)' : 'var(--success-light)',
                                        color: needsAction ? 'var(--danger)' : 'var(--success)',
                                        fontWeight: 600, cursor: 'pointer', border: '1px solid currentColor',
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                     }}
                                  >
                                     {needsAction ? <AlertTriangle size={14}/> : <Check size={14}/>}
                                     {needsAction ? `${issuesCount || 3} Issues Found` : 'Ready'}
                                  </div>
                                  {needsAction && (
                                     <div className="customTooltipBox" style={{
                                        position: 'absolute', bottom: '120%', left: '50%', transform: 'translate(-50%, 0)',
                                        backgroundColor: 'var(--bg-root)', padding: '16px', border: '1px solid var(--border)',
                                        borderRadius: '8px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                                        width: 'max-content', zIndex: 100, display: 'none'
                                     }}>
                                        <div style={{fontWeight: 700, marginBottom: '12px', fontSize: '0.8rem', color: 'var(--text-muted)'}}>VALIDATION ISSUES</div>
                                        <ul style={{margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: '8px'}}>
                                           {statusArray.map((iss, i) => <li key={i}>{iss}</li>)}
                                        </ul>
                                     </div>
                                  )}
                               </div>
                            </td>
                            <td style={{textAlign: 'right'}}>
                               <button 
                                  onClick={() => setActiveOverlayId(member.subscriber_id)}
                                  style={{border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--text)', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap'}}
                                  onMouseOver={(e) => e.target.style.backgroundColor = 'var(--bg-root)'}
                                  onMouseOut={(e) => e.target.style.backgroundColor = 'transparent'}
                               >
                                  View More Details
                               </button>
                            </td>
                         </tr>
                      );
                   })}
                </tbody>
             </table>
           </div>
         </Annotation>
      </div>

      {activeOverlayId && activeMember && (
         <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
            backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', 
            zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center'
         }}>
            <Annotation
               title="Overlay"
               what="Deep dive"
               why="Reduces clutter"
               how="Shows full member history without polluting the main business view."
               direction="left"
            >
               <div style={{
                  backgroundColor: 'var(--bg-root)', width: '90vw', maxWidth: '1000px', height: '85vh',
                  borderRadius: '16px', display: 'flex', flexDirection: 'column',
                  boxShadow: '0 25px 50px rgba(0,0,0,0.3)', overflow: 'hidden'
               }}>
                  <div style={{padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)'}}>
                     <h2 style={{fontWeight: 800, fontSize: '1.4rem'}}>Secondary Member Details</h2>
                     <button onClick={() => setActiveOverlayId(null)} style={{background: 'var(--bg-root)', border: '1px solid var(--border)', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center'}}><X size={20} /></button>
                  </div>
                  
                  <div style={{flex: 1, overflowY: 'auto', padding: '40px'}}>
                     <div className={styles.sectionCard} style={{padding: '32px', marginBottom: '40px', backgroundColor: 'var(--bg-surface)'}}>
                        <h3 style={{fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '24px', fontWeight: 700}}>Primary Member Info</h3>
                        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px'}}>
                           <div>
                              <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px'}}>Member Identifier</div>
                              <div style={{fontWeight: 700, fontSize: '1.3rem', fontFamily: 'monospace'}}>{activeMember.subscriber_id}</div>
                           </div>
                           <div>
                              <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px'}}>Member Name</div>
                              <div style={{fontWeight: 600, fontSize: '1.2rem'}}>{activeMember.history?.[activeMember.latest_update]?.member_info?.first_name || 'Unknown'} {activeMember.history?.[activeMember.latest_update]?.member_info?.last_name || ''}</div>
                           </div>
                           <div>
                              <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px'}}>Payer / Sponsor</div>
                              <div style={{fontWeight: 600, fontSize: '1.2rem'}}>{activeMember.history?.[activeMember.latest_update]?.coverages?.[0]?.plan_code || 'Standard Plan'}</div>
                           </div>
                           <div>
                              <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px'}}>Coverage Effective Date</div>
                              <div style={{fontWeight: 600, fontSize: '1.2rem'}}>{activeMember.history?.[activeMember.latest_update]?.coverages?.[0]?.effective_date || 'N/A'}</div>
                           </div>
                        </div>
                     </div>

                     <div>
                        <h3 style={{fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '16px', fontWeight: 700}}>Dependents Section</h3>
                        <div className={styles.sectionCard}>
                           <table className={styles.table}>
                              <thead style={{backgroundColor: 'var(--bg-surface)'}}>
                                 <tr>
                                    <th>Dependent Name</th>
                                    <th>Date of Birth</th>
                                    <th>Gender</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {generateDummyDependents(activeMember.subscriber_id).map((dep, i) => (
                                    <tr key={i}>
                                       <td style={{fontWeight: 500, fontSize: '1.05rem'}}>{dep.name}</td>
                                       <td>{dep.dob}</td>
                                       <td>{dep.gender}</td>
                                    </tr>
                                 ))}
                              </tbody>
                           </table>
                        </div>
                     </div>
                  </div>
               </div>
            </Annotation>
         </div>
      )}

      {/* --- DRILL-DOWN PANEL FOR FILE CLICK --- */}
      <div style={{
          position: 'fixed', top: 0, right: activeFile ? 0 : '-500px', width: '500px', height: '100vh',
          backgroundColor: 'var(--bg-root)', boxShadow: '-10px 0 30px rgba(0,0,0,0.15)',
          transition: 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1)', zIndex: 10000,
          display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border)'
       }}>
          {activeFile && (
             <>
                <div style={{padding: '24px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface)'}}>
                   <h2 style={{fontWeight: 800, fontSize: '1.2rem'}}>Dependents in File</h2>
                   <button onClick={() => setActiveFile(null)} style={{background: 'var(--bg-root)', border: '1px solid var(--border)', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center'}}><X size={20} /></button>
                </div>
                
                <div style={{flex: 1, overflowY: 'auto', padding: '32px'}}>
                   <div style={{marginBottom: '24px'}}>
                      <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px'}}>File Source</div>
                      <div style={{fontWeight: 700, fontFamily: 'monospace', fontSize: '1.1rem'}}>{activeFile.fileName.endsWith('.edi') ? activeFile.fileName : `${activeFile.fileName}.edi`}</div>
                   </div>

                   {isLoadingDependents ? (
                      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '16px'}}>
                         <RefreshCw size={32} className="animate-spin" color="var(--primary)" />
                         <span style={{color: 'var(--text-muted)', fontWeight: 600}}>Extracting dependent data...</span>
                      </div>
                   ) : (
                      <Annotation
                         title="Dependents table"
                         what="Detailed visibility"
                         why="Supports verification"
                         how="Extrapolates file-level drill down, ensuring no data sits hidden."
                         direction="left"
                      >
                         <div className={styles.sectionCard}>
                            <table className={styles.table}>
                               <thead style={{backgroundColor: 'var(--bg-surface)'}}>
                                  <tr>
                                     <th>Dependent Name</th>
                                     <th>Date of Birth</th>
                                     <th>Gender</th>
                                  </tr>
                               </thead>
                               <tbody>
                                  {generateDummyDependents(activeFile.id).map((dep, i) => (
                                     <tr key={i}>
                                        <td style={{fontWeight: 500, fontSize: '0.95rem'}}>{dep.name}</td>
                                        <td>{dep.dob}</td>
                                        <td>{dep.gender}</td>
                                     </tr>
                                  ))}
                               </tbody>
                            </table>
                         </div>
                      </Annotation>
                   )}
                </div>
             </>
          )}
       </div>

    </div>
  );
}
